import { TRPCError } from "@trpc/server";
import { and, eq, gt, lt, or, sql } from "drizzle-orm";
import { type z } from "zod";

import { CRYPTO_VERSION } from "@/lib/secret-crypto";
import {
  EXPIRES_IN_MS,
  MAX_PASSPHRASE_ATTEMPTS,
  MAX_VIEWS_COUNT,
} from "@/lib/secret-options";
import { db } from "@/server/db";
import { secrets } from "@/server/db/schemas/secrets";
import {
  decodeSecretIdToken,
  deleteSecret,
  generateDeleteToken,
  getCreatorFingerprint,
  hashAuthToken,
  hashDeleteToken,
  verifyAuthToken,
} from "./secret";
import {
  type lifetimeSchema,
  type metaSchema,
  type passphraseSchema,
} from "./schemas";

type SecretType = (typeof secrets.$inferSelect)["type"];

export const decodeIdTokenOrThrow = (idToken: string): string => {
  try {
    return decodeSecretIdToken(idToken);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid idToken" });
  }
};

/** The columns every new secret needs, besides its content. */
export async function buildNewSecretValues(
  input: {
    clientIp: string;
    meta: z.infer<typeof metaSchema>;
    passphrase?: z.infer<typeof passphraseSchema>;
  } & z.infer<typeof lifetimeSchema>,
) {
  const now = new Date();
  const deleteToken = generateDeleteToken();

  return {
    deleteToken,
    values: {
      version: CRYPTO_VERSION,
      identification: getCreatorFingerprint({ ip: input.clientIp, date: now }),
      metaCiphertext: input.meta.ciphertext,
      metaIv: input.meta.iv,
      passphraseSalt: input.passphrase?.salt ?? null,
      passphraseIterations: input.passphrase?.iterations ?? null,
      authTokenHash: input.passphrase
        ? await hashAuthToken(input.passphrase.authToken)
        : null,
      deleteTokenHash: hashDeleteToken(deleteToken),
      maxViews: MAX_VIEWS_COUNT[input.maxViews],
      expiresAt: new Date(now.getTime() + EXPIRES_IN_MS[input.expiresIn]),
    },
  };
}

const unavailable = () =>
  new TRPCError({
    code: "NOT_FOUND",
    message: "This secret is invalid, expired, or has already been viewed.",
  });

/** Records a wrong passphrase and destroys the secret after too many attempts. Always throws. */
async function registerFailedAttempt(id: string): Promise<never> {
  const [row] = await db
    .update(secrets)
    .set({ failedAttempts: sql`${secrets.failedAttempts} + 1` })
    .where(eq(secrets.id, id))
    .returning({ failedAttempts: secrets.failedAttempts });

  if (!row) throw unavailable();

  const remaining = MAX_PASSPHRASE_ATTEMPTS - row.failedAttempts;
  if (remaining <= 0) {
    await deleteSecret(id);
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Too many incorrect passphrase attempts. The secret has been destroyed.",
    });
  }

  throw new TRPCError({
    code: "UNAUTHORIZED",
    message: `Incorrect passphrase. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`,
  });
}

/**
 * Checks the passphrase and counts one view, atomically: concurrent requests can never get more
 * views than `maxViews`. Returns the content columns; when `isLastView` is true the caller must
 * delete the secret once it has read what it needs (e.g. the stored file).
 */
export async function claimView(params: {
  id: string;
  type: SecretType;
  authToken?: string;
}) {
  const access = await db
    .select({ type: secrets.type, authTokenHash: secrets.authTokenHash })
    .from(secrets)
    .where(eq(secrets.id, params.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!access) throw unavailable();

  if (access.type !== params.type) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `This secret is not a ${params.type} secret.`,
    });
  }

  if (access.authTokenHash) {
    if (!params.authToken) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "This secret is protected by a passphrase.",
      });
    }
    if (!(await verifyAuthToken(params.authToken, access.authTokenHash))) {
      await registerFailedAttempt(params.id);
    }
  }

  const now = new Date();
  const [row] = await db
    .update(secrets)
    .set({ viewCount: sql`${secrets.viewCount} + 1`, updatedAt: now })
    .where(
      and(
        eq(secrets.id, params.id),
        gt(secrets.expiresAt, now),
        or(eq(secrets.maxViews, 0), lt(secrets.viewCount, secrets.maxViews)),
      ),
    )
    .returning({
      contentCiphertext: secrets.contentCiphertext,
      contentIv: secrets.contentIv,
      viewCount: secrets.viewCount,
      maxViews: secrets.maxViews,
    });

  if (!row) {
    // Expired or out of views (possibly by a concurrent request): make sure it's gone.
    await deleteSecret(params.id);
    throw unavailable();
  }

  return {
    ...row,
    isLastView: row.maxViews > 0 && row.viewCount >= row.maxViews,
  };
}
