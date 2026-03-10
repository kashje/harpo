import { z } from "zod";
import { eq } from "drizzle-orm";

import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { secrets } from "@/server/db/schemas/secrets";
import { TRPCError } from "@trpc/server";
import { env } from "@/env";
import { validateSecret } from "../utils/secret";

const GetSecretByIdSchema = z.object({
  id: z.string().uuid(),
});

export const secretRouter = createTRPCRouter({
  get: publicProcedure
    .input(GetSecretByIdSchema)
    .query(async ({ ctx, input }) => {
      const row = await ctx.db
        .select({
          id: secrets.id,
          name: secrets.name,
          encryptedPayload: secrets.encryptedPayload,
          viewCount: secrets.viewCount,
          maxViews: secrets.maxViews,
          fileType: secrets.fileType,
          expiresAt: secrets.expiresAt,
          taggedDeletionAt: secrets.taggedDeletionAt,
        })
        .from(secrets)
        .where(eq(secrets.id, input.id))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (!row) return null;

      await validateSecret(row);

      return row;
    }),

  tagDeletion: publicProcedure
    .input(GetSecretByIdSchema)
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
    .input(GetSecretByIdSchema)
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db
        .select({
          id: secrets.id,
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
        await ctx.db.delete(secrets).where(eq(secrets.id, input.id));
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
});

export type SecretRouter = typeof secretRouter;
