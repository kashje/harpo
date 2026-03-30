import { Readable } from "stream";
import { randomUUID } from "crypto";
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
} from "@/server/api/utils/secret";

const expiresInMs = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
} as const;

const maxViewsMap = {
  "1": 1,
  "3": 3,
  "5": 5,
  "10": 10,
  unlimited: 0,
} as const;

const UploadInputSchema = z.object({
  encryptedBytes: z.string().min(1),
  iv: z.string().min(1),
  originalName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  name: z.string().max(255).optional(),
  passphrase: z.string().optional(),
  expiresIn: z.enum(["1h", "24h", "3d", "7d", "30d"]),
  maxViews: z.enum(["1", "3", "5", "10", "unlimited"]),
});

const UploadOutputSchema = z.object({
  idToken: z.string().min(1),
});

export const storageRouter = createTRPCRouter({
  upload: publicProcedure
    .input(UploadInputSchema)
    .output(UploadOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const maxSize = env.MAX_UPLOAD_SIZE_BYTES;
      const byteLength = Buffer.byteLength(input.encryptedBytes, "base64");
      if (byteLength > maxSize) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: `File exceeds maximum allowed size of ${(maxSize / 1024 / 1024).toFixed(0)} MB`,
        });
      }

      const secretId = randomUUID();
      const storagePath = `secrets/${secretId}/file`;

      const fileBuffer = Buffer.from(input.encryptedBytes, "base64url");
      try {
        const readable = Readable.from(fileBuffer);
        await createStorageAdapter().upload(storagePath, readable);
      } catch (err) {
        console.error("[storage.upload] Storage error:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to store file",
        });
      }

      const now = Date.now();
      const ipHeader = ctx.headers.get("x-forwarded-for");
      const ip = ipHeader?.split(",")[0]?.trim() ?? "";
      const userAgent = ctx.headers.get("user-agent") ?? "";

      const encryptedPayload = JSON.stringify({
        version: "v1",
        type: "file",
        iv: input.iv,
        originalName: input.originalName,
        mimeType: input.mimeType,
      });

      try {
        const [inserted] = await ctx.db
          .insert(secrets)
          .values({
            id: secretId,
            name: input.name?.trim() ?? input.originalName,
            identification: getCreatorFingerprint({
              ip,
              userAgent,
              date: new Date(now),
            }),
            encryptedPayload,
            maxViews: maxViewsMap[input.maxViews],
            passwordHash: input.passphrase ?? null,
            expiresAt: new Date(now + expiresInMs[input.expiresIn]),
          })
          .returning({ id: secrets.id });

        if (!inserted) {
          throw new Error("Insert returned no rows");
        }

        return { idToken: encodeSecretIdToken(inserted.id) };
      } catch (err) {
        console.error("[storage.upload] DB error:", err);
        try {
          await createStorageAdapter().delete(storagePath);
        } catch {
          // best-effort cleanup
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create secret",
        });
      }
    }),

  download: publicProcedure
    .input(z.object({ idToken: z.string().min(1) }))
    .output(z.object({ encryptedBytes: z.string() }))
    .mutation(async ({ ctx, input }) => {
      let secretId: string;
      try {
        secretId = decodeSecretIdToken(input.idToken);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid idToken",
        });
      }

      const row = await ctx.db
        .select({
          id: secrets.id,
          viewCount: secrets.viewCount,
          maxViews: secrets.maxViews,
          expiresAt: secrets.expiresAt,
        })
        .from(secrets)
        .where(eq(secrets.id, secretId))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Secret not found",
        });
      }

      if (row.expiresAt.getTime() <= Date.now()) {
        await ctx.db.delete(secrets).where(eq(secrets.id, secretId));
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Secret has expired",
        });
      }

      const hasViewLimit = row.maxViews >= 1;
      if (hasViewLimit && row.viewCount >= row.maxViews) {
        await ctx.db.delete(secrets).where(eq(secrets.id, secretId));
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Secret has reached the maximum number of views",
        });
      }

      try {
        const storagePath = `secrets/${secretId}/file`;
        const storage = createStorageAdapter();
        const readable = await storage.download(storagePath);

        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          readable.on("data", (chunk: Buffer) => chunks.push(chunk));
          readable.on("end", resolve);
          readable.on("error", reject);
        });
        const fileBytes = Buffer.concat(chunks);

        return { encryptedBytes: fileBytes.toString("base64url") };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        console.error("[storage.download] Storage error:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve file",
        });
      }
    }),

  delete: publicProcedure
    .input(z.object({ idToken: z.string().min(1) }))
    .output(z.object({ success: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      let secretId: string;
      try {
        secretId = decodeSecretIdToken(input.idToken);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid idToken",
        });
      }

      const row = await ctx.db
        .select({ id: secrets.id })
        .from(secrets)
        .where(eq(secrets.id, secretId))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Secret not found",
        });
      }

      try {
        const storagePath = `secrets/${secretId}/file`;
        await createStorageAdapter().delete(storagePath);
      } catch (err) {
        console.error("[storage.delete] Storage error:", err);
      }

      await ctx.db.delete(secrets).where(eq(secrets.id, secretId));

      return { success: true as const };
    }),
});

export type StorageRouter = typeof storageRouter;
