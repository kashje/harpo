import { z } from "zod";

import {
  AES_GCM_IV_BYTES,
  AES_GCM_TAG_BYTES,
  AUTH_TOKEN_BYTES,
  DELETE_TOKEN_BYTES,
  EXPIRES_IN_VALUES,
  MAX_META_BYTES,
  MAX_VIEWS_VALUES,
  PASSPHRASE_SALT_BYTES,
  PBKDF2_MAX_ITERATIONS,
  PBKDF2_MIN_ITERATIONS,
  base64urlLength,
} from "@/lib/secret-options";

const BASE64URL = /^[A-Za-z0-9_-]*$/;

const base64url = (bytes: number) =>
  z.string().length(base64urlLength(bytes)).regex(BASE64URL);

export const idTokenSchema = z.string().min(1).max(256);

export const authTokenSchema = base64url(AUTH_TOKEN_BYTES);

export const deleteTokenSchema = base64url(DELETE_TOKEN_BYTES);

export const ivSchema = base64url(AES_GCM_IV_BYTES);

/** AES-GCM output of at most `maxPlaintextBytes` bytes of plaintext. */
export const encryptedBlobSchema = (maxPlaintextBytes: number) =>
  z.object({
    ciphertext: z
      .string()
      .min(1)
      .max(base64urlLength(maxPlaintextBytes + AES_GCM_TAG_BYTES))
      .regex(BASE64URL),
    iv: ivSchema,
  });

export const metaSchema = encryptedBlobSchema(MAX_META_BYTES);

export const passphraseSchema = z.object({
  salt: base64url(PASSPHRASE_SALT_BYTES),
  iterations: z
    .number()
    .int()
    .min(PBKDF2_MIN_ITERATIONS)
    .max(PBKDF2_MAX_ITERATIONS),
  authToken: authTokenSchema,
});

export const lifetimeSchema = z.object({
  expiresIn: z.enum(EXPIRES_IN_VALUES),
  maxViews: z.enum(MAX_VIEWS_VALUES),
});

/** Everything about a new file secret except the file, which is the request body. */
export const fileUploadMetadataSchema = lifetimeSchema.extend({
  iv: ivSchema,
  meta: metaSchema,
  passphrase: passphraseSchema.optional(),
});

export const fileDownloadSchema = z.object({
  idToken: idTokenSchema,
  authToken: authTokenSchema.optional(),
});
