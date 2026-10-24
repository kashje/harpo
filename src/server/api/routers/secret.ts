import { randomUUID } from "crypto";
import { z } from "zod";

import { TRPCError } from "@trpc/server";

import { MAX_TEXT_SECRET_BYTES } from "@/lib/secret-options";
import {
  createSecretProcedure,
  createTRPCRouter,
  publicProcedure,
} from "@/server/api/trpc";
import {
  createSecret,
  deleteUnviewedSecret,
  readSecret,
} from "@/server/secretStore";
import {
  deleteSecretFile,
  encodeSecretIdToken,
  hashDeleteToken,
  isSecretUnavailable,
  safeEqual,
  tryDecodeSecretIdToken,
} from "../utils/secret";
import {
  buildNewSecretValues,
  claimView,
  decodeIdTokenOrThrow,
} from "../utils/secretAccess";
import {
  authTokenSchema,
  deleteTokenSchema,
  encryptedBlobSchema,
  idTokenSchema,
  lifetimeSchema,
  metaSchema,
  passphraseSchema,
} from "../utils/schemas";

const CreateTextSecretSchema = lifetimeSchema.extend({
  content: encryptedBlobSchema(MAX_TEXT_SECRET_BYTES),
  meta: metaSchema,
  passphrase: passphraseSchema.optional(),
});

const CreatedSecretSchema = z.object({
  idToken: z.string().min(1),
  deleteToken: z.string().min(1),
});

export const secretRouter = createTRPCRouter({
  /**
   * Public metadata of a secret. Never returns the content: that only comes from `reveal` (or
   * the file download in `src/server/api/files.ts`), which count a view and check the passphrase.
   */
  get: publicProcedure
    .input(z.object({ idToken: idTokenSchema }))
    .query(async ({ input }) => {
      const id = tryDecodeSecretIdToken(input.idToken);
      if (!id) return null;

      const row = await readSecret(id);
      if (!row || isSecretUnavailable(row)) return null;

      return {
        type: row.type,
        meta: { ciphertext: row.metaCiphertext, iv: row.metaIv },
        viewCount: row.viewCount,
        maxViews: row.maxViews,
        expiresAt: row.expiresAt,
        passphrase:
          row.passphraseSalt && row.passphraseIterations
            ? { salt: row.passphraseSalt, iterations: row.passphraseIterations }
            : null,
      };
    }),

  /** Counts a view and returns the encrypted text. The last view deletes the secret. */
  reveal: publicProcedure
    .input(
      z.object({
        idToken: idTokenSchema,
        authToken: authTokenSchema.optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const id = decodeIdTokenOrThrow(input.idToken);
      const view = await claimView({
        id,
        type: "text",
        authToken: input.authToken,
      });

      if (!view.contentCiphertext) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Secret has no content",
        });
      }

      return {
        content: { ciphertext: view.contentCiphertext, iv: view.contentIv },
        viewCount: view.viewCount,
        maxViews: view.maxViews,
        destroyed: view.isLastView,
      };
    }),

  create: createSecretProcedure
    .input(CreateTextSecretSchema)
    .output(CreatedSecretSchema)
    .mutation(async ({ input }) => {
      const { deleteToken, values } = await buildNewSecretValues(input);
      const id = randomUUID();

      try {
        await createSecret(id, {
          ...values,
          type: "text",
          contentCiphertext: input.content.ciphertext,
          contentIv: input.content.iv,
        });
      } catch (err) {
        console.error("[secret.create] Redis error:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create secret",
        });
      }

      return { idToken: encodeSecretIdToken(id), deleteToken };
    }),

  /** Lets the creator delete a secret with its delete token, as long as nobody viewed it yet. */
  delete: publicProcedure
    .input(z.object({ idToken: idTokenSchema, deleteToken: deleteTokenSchema }))
    .output(z.object({ success: z.literal(true) }))
    .mutation(async ({ input }) => {
      const id = decodeIdTokenOrThrow(input.idToken);

      const row = await readSecret(id);
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Secret not found. It may have expired or been viewed.",
        });
      }

      if (!safeEqual(hashDeleteToken(input.deleteToken), row.deleteTokenHash)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Invalid delete token",
        });
      }

      const result = await deleteUnviewedSecret(id);
      if (result === "gone") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Secret not found. It may have expired or been viewed.",
        });
      }
      if (result === "viewed") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "This secret has already been viewed and can no longer be deleted.",
        });
      }

      if (row.type === "file") await deleteSecretFile(id);

      return { success: true as const };
    }),
});

export type SecretRouter = typeof secretRouter;
