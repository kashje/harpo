import { z } from "zod";
import { eq } from "drizzle-orm";

import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { secrets } from "@/server/db/schemas/secrets";
import { TRPCError } from "@trpc/server";

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
        })
        .from(secrets)
        .where(eq(secrets.id, input.id))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (!row) return null;

      const now = Date.now();
      const expiresAtMs = row.expiresAt.getTime();
      const isExpired = expiresAtMs <= now;

      const hasViewLimit = row.maxViews >= 1;
      const isDepleted = hasViewLimit && row.viewCount >= row.maxViews;

      if (isExpired || isDepleted) return null;

      return row;
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

      const now = Date.now();
      if (row.expiresAt.getTime() <= now) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Secret is expired",
        });
      }

      const hasViewLimit = row.maxViews >= 1;
      if (hasViewLimit && row.viewCount >= row.maxViews) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Secret has reached the maximum amount of views",
        });
      }

      const nextViewCount = row.viewCount + 1;

      if (hasViewLimit && nextViewCount >= row.maxViews) {
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
