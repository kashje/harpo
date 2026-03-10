import { db } from "@/server/db";
import { secrets } from "@/server/db/schemas/secrets";
import type { Secret } from "@/types";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export async function validateSecret(
  secret: Pick<
    NonNullable<Secret>,
    "id" | "viewCount" | "maxViews" | "expiresAt"
  >,
) {
  const now = Date.now();
  if (secret.expiresAt.getTime() <= now) {
    // Delete the secret
    await db.delete(secrets).where(eq(secrets.id, secret.id));
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Secret is expired",
    });
  }

  const hasViewLimit = secret.maxViews >= 1;
  if (hasViewLimit && secret.viewCount >= secret.maxViews) {
    // Delete the secret
    await db.delete(secrets).where(eq(secrets.id, secret.id));
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Secret has reached the maximum amount of views",
    });
  }
}
