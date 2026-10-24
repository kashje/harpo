import { TRPCError } from "@trpc/server";
import type { z } from "zod";

import { CRYPTO_VERSION } from "@/lib/secret-crypto";
import {
  EXPIRES_IN_MS,
  MAX_PASSPHRASE_ATTEMPTS,
  MAX_VIEWS_COUNT,
} from "@/lib/secret-options";
import {
  claimSecretView,
  readSecret,
  recordFailedAttempt,
  type NewSecret,
  type SecretType,
} from "@/server/secretStore";
import {
  decodeSecretIdToken,
  deleteSecret,
  generateDeleteToken,
  hashAuthToken,
  hashDeleteToken,
  verifyAuthToken,
} from "./secret";
import type { lifetimeSchema, metaSchema, passphraseSchema } from "./schemas";

export const decodeIdTokenOrThrow = (idToken: string): string => {
  try {
    return decodeSecretIdToken(idToken);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid idToken" });
  }
};

/** The fields every new secret needs, besides its type and content. */
export async function buildNewSecretValues(
  input: {
    meta: z.infer<typeof metaSchema>;
    passphrase?: z.infer<typeof passphraseSchema>;
  } & z.infer<typeof lifetimeSchema>,
): Promise<{
  deleteToken: string;
  values: Omit<NewSecret, "type" | "contentCiphertext" | "contentIv">;
}> {
  const now = new Date();
  const deleteToken = generateDeleteToken();

  return {
    deleteToken,
    values: {
      version: CRYPTO_VERSION,
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
  const failedAttempts = await recordFailedAttempt(id);
  if (failedAttempts === null) throw unavailable();

  const remaining = MAX_PASSPHRASE_ATTEMPTS - failedAttempts;
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
 * views than `maxViews`. The last view of a text secret deletes it right away; for a file secret
 * `isLastView` is true and the caller must delete it once it has read the stored file.
 */
export async function claimView(params: {
  id: string;
  type: SecretType;
  authToken?: string;
}) {
  const access = await readSecret(params.id);
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

  // Gone, expired or out of views (possibly by a concurrent request). Whoever claimed the last
  // view deletes the secret, and Redis drops expired ones, so there is nothing to clean up here.
  const row = await claimSecretView(params.id);
  if (!row) throw unavailable();

  return {
    ...row,
    isLastView: row.maxViews > 0 && row.viewCount >= row.maxViews,
  };
}
