import { z } from "zod";
import { eq } from "drizzle-orm";

import { TRPCError } from "@trpc/server";

import { env } from "@/env";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { secrets } from "@/server/db/schemas/secrets";
import { createStorageAdapter } from "@/server/storage";
import {
  decodeSecretIdToken,
  encodeSecretIdToken,
  getCreatorFingerprint,
  validateSecret,
} from "../utils/secret";
import type { SecretPayload } from "@/types";

const GetSecretSchema = z.object({
  id: z.string().min(1),
});

/** Client sends the SHA-256 hash of the passphrase; server never sees plaintext. */
const CheckPasswordSchema = z.object({
  id: z.string().uuid(),
  password: z.string().min(1), // passphrase hash (hex)
});

const EncryptedPayloadSchema = z.object({
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  version: z.literal("v1"),
});

/** Client sends passphrase as SHA-256 hash (hex); server never sees plaintext. */
const CreateSharedTextSecretSchema = z.object({
  encrypted: EncryptedPayloadSchema,
  name: z.string().max(255).optional(),
  passphrase: z.string().optional(), // passphrase hash (hex)
  expiresIn: z.enum(["1h", "24h", "3d", "7d", "30d"]),
  maxViews: z.enum(["1", "3", "5", "10", "unlimited"]),
});

const CreateSharedTextSecretResultSchema = z.object({
  idToken: z.string().min(1),
});

export const secretRouter = createTRPCRouter({
  get: publicProcedure.input(GetSecretSchema).query(async ({ ctx, input }) => {
    let resolvedId = input.id;

    try {
      resolvedId = decodeSecretIdToken(input.id);
    } catch {
      return null;
    }

    const row = await ctx.db
      .select({
        id: secrets.id,
        name: secrets.name,
        encryptedPayload: secrets.encryptedPayload,
        viewCount: secrets.viewCount,
        maxViews: secrets.maxViews,
        expiresAt: secrets.expiresAt,
        taggedDeletionAt: secrets.taggedDeletionAt,
        passwordHash: secrets.passwordHash,
      })
      .from(secrets)
      .where(eq(secrets.id, resolvedId))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (!row) return null;

    await validateSecret(row);

    const { passwordHash, ...rest } = row;

    return {
      ...rest,
      hasPassword: passwordHash !== null,
    };
  }),

  tagDeletion: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db
        .select({
          id: secrets.id,
          viewCount: secrets.viewCount,
          maxViews: secrets.maxViews,
          expiresAt: secrets.expiresAt,
          taggedDeletionAt: secrets.taggedDeletionAt,
        })
        .from(secrets)
        .where(eq(secrets.id, input.id))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Secret not found",
        });
      }

      await validateSecret(row);

      if (row.taggedDeletionAt) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Secret is already tagged, will be deleted soon",
        });
      }

      const now = Date.now();
      const requestedExpiry =
        now + env.NEXT_PUBLIC_LAST_VIEW_COUNTDOWN_SECONDS * 1000;
      const newExpiresAt = new Date(
        Math.min(row.expiresAt.getTime(), requestedExpiry),
      );

      await ctx.db
        .update(secrets)
        .set({
          expiresAt: newExpiresAt,
          taggedDeletionAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(secrets.id, input.id));

      return { expiresAt: newExpiresAt };
    }),

  consume: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db
        .select({
          id: secrets.id,
          encryptedPayload: secrets.encryptedPayload,
          viewCount: secrets.viewCount,
          maxViews: secrets.maxViews,
          expiresAt: secrets.expiresAt,
        })
        .from(secrets)
        .where(eq(secrets.id, input.id))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Secret not found",
        });
      }

      await validateSecret(row);

      const nextViewCount = row.viewCount + 1;
      if (row.maxViews >= 1 && nextViewCount >= row.maxViews) {
        const encryptedPayload = JSON.parse(
          row.encryptedPayload,
        ) as SecretPayload;
        await ctx.db.delete(secrets).where(eq(secrets.id, input.id));
        if (encryptedPayload.type === "file") {
          try {
            await createStorageAdapter().delete(`secrets/${row.id}/file`);
          } catch (err) {
            console.error(
              "[secret.consume] Failed to delete storage file:",
              err,
            );
          }
        }
        return {
          deleted: true as const,
          viewCount: nextViewCount,
        };
      }

      await ctx.db
        .update(secrets)
        .set({ viewCount: nextViewCount, updatedAt: new Date() })
        .where(eq(secrets.id, input.id));

      return {
        deleted: false as const,
        viewCount: nextViewCount,
      };
    }),

  checkPassword: publicProcedure
    .input(CheckPasswordSchema)
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db
        .select({
          id: secrets.id,
          passwordHash: secrets.passwordHash,
        })
        .from(secrets)
        .where(eq(secrets.id, input.id))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Secret not found",
        });
      }

      if (!row.passwordHash) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Secret is not password protected",
        });
      }

      if (row.passwordHash !== input.password) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid password",
        });
      }

      return { valid: true as const };
    }),

  create: publicProcedure
    .input(CreateSharedTextSecretSchema)
    .output(CreateSharedTextSecretResultSchema)
    .mutation(async ({ ctx, input }) => {
      const now = Date.now();

      const expiresInMs: Record<(typeof input)["expiresIn"], number> = {
        "1h": 60 * 60 * 1000,
        "24h": 24 * 60 * 60 * 1000,
        "3d": 3 * 24 * 60 * 60 * 1000,
        "7d": 7 * 24 * 60 * 60 * 1000,
        "30d": 30 * 24 * 60 * 60 * 1000,
      };

      const expiresAt = new Date(now + expiresInMs[input.expiresIn]);

      const maxViewsMap: Record<(typeof input)["maxViews"], number> = {
        "1": 1,
        "3": 3,
        "5": 5,
        "10": 10,
        unlimited: 0,
      };

      const maxViews = maxViewsMap[input.maxViews];

      const ipHeader = ctx.headers.get("x-forwarded-for");
      const ip = ipHeader?.split(",")[0]?.trim() ?? "";

      const userAgent = ctx.headers.get("user-agent") ?? "";

      const identification = getCreatorFingerprint({
        ip,
        userAgent,
        date: new Date(now),
      });

      const encryptedPayload = JSON.stringify({
        version: input.encrypted.version,
        ciphertext: input.encrypted.ciphertext,
        type: "text",
        iv: input.encrypted.iv,
      });

      const [inserted] = await ctx.db
        .insert(secrets)
        .values({
          name: input.name?.trim() ?? "Text secret",
          identification,
          encryptedPayload,
          maxViews,
          passwordHash: input.passphrase ?? null,
          expiresAt,
        })
        .returning({ id: secrets.id });

      if (!inserted) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create secret",
        });
      }

      const idToken = encodeSecretIdToken(inserted.id);

      return { idToken };
    }),
});

export type SecretRouter = typeof secretRouter;
