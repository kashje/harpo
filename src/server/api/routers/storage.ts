import { Readable } from "stream";
import { randomUUID } from "crypto";
import { z } from "zod";

import { TRPCError } from "@trpc/server";
import { env } from "@/env";

import { AES_GCM_TAG_BYTES } from "@/lib/secret-options";
import {
  createSecretProcedure,
  createTRPCRouter,
  publicProcedure,
} from "@/server/api/trpc";
import { createSecret } from "@/server/secretStore";
import { createStorageAdapter } from "@/server/storage";
import {
  deleteSecret,
  encodeSecretIdToken,
  secretFilePath,
} from "@/server/api/utils/secret";
import {
  buildNewSecretValues,
  claimView,
  decodeIdTokenOrThrow,
} from "@/server/api/utils/secretAccess";
import {
  authTokenSchema,
  idTokenSchema,
  ivSchema,
  lifetimeSchema,
  metaSchema,
  passphraseSchema,
} from "@/server/api/utils/schemas";

const UploadInputSchema = lifetimeSchema.extend({
  encryptedBytes: z.string().min(1),
  iv: ivSchema,
  meta: metaSchema,
  passphrase: passphraseSchema.optional(),
});

const UploadOutputSchema = z.object({
  idToken: z.string().min(1),
  deleteToken: z.string().min(1),
});

async function readStream(readable: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of readable) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export const storageRouter = createTRPCRouter({
  upload: createSecretProcedure
    .input(UploadInputSchema)
    .output(UploadOutputSchema)
    .mutation(async ({ input }) => {
      const maxSize = env.MAX_UPLOAD_SIZE_BYTES;
      // The ciphertext is the file plus the AES-GCM tag.
      const byteLength = Buffer.byteLength(input.encryptedBytes, "base64url");
      if (byteLength > maxSize + AES_GCM_TAG_BYTES) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: `File exceeds maximum allowed size of ${(maxSize / 1024 / 1024).toFixed(0)} MB`,
        });
      }

      const secretId = randomUUID();
      const { deleteToken, values } = await buildNewSecretValues(input);

      // The secret goes in before its file: the sweeper deletes every file without a secret, so
      // the other way around it could remove a file that was just uploaded. Nobody has the link
      // yet, so the secret can't be opened before the file is there.
      try {
        await createSecret(secretId, {
          ...values,
          type: "file",
          contentCiphertext: null,
          contentIv: input.iv,
        });
      } catch (err) {
        console.error("[storage.upload] Redis error:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create secret",
        });
      }

      try {
        const readable = Readable.from(
          Buffer.from(input.encryptedBytes, "base64url"),
        );
        await createStorageAdapter().upload(secretFilePath(secretId), readable);
      } catch (err) {
        console.error("[storage.upload] Storage error:", err);
        await deleteSecret(secretId).catch(() => undefined); // best-effort cleanup
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to store file",
        });
      }

      return { idToken: encodeSecretIdToken(secretId), deleteToken };
    }),

  /** Counts a view and returns the encrypted file. The last view deletes the secret and file. */
  download: publicProcedure
    .input(
      z.object({
        idToken: idTokenSchema,
        authToken: authTokenSchema.optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const secretId = decodeIdTokenOrThrow(input.idToken);
      const view = await claimView({
        id: secretId,
        type: "file",
        authToken: input.authToken,
      });

      let fileBytes: Buffer;
      try {
        fileBytes = await readStream(
          await createStorageAdapter().download(secretFilePath(secretId)),
        );
      } catch (err) {
        console.error("[storage.download] Storage error:", err);
        if (view.isLastView) await deleteSecret(secretId);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve file",
        });
      }

      if (view.isLastView) await deleteSecret(secretId);

      return {
        encryptedBytes: fileBytes.toString("base64url"),
        iv: view.contentIv,
        viewCount: view.viewCount,
        maxViews: view.maxViews,
        destroyed: view.isLastView,
      };
    }),
});

export type StorageRouter = typeof storageRouter;
