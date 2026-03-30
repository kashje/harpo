import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHmac,
} from "node:crypto";

import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { env } from "@/env";
import { db } from "@/server/db";
import { secrets } from "@/server/db/schemas/secrets";
import { createStorageAdapter } from "@/server/storage";
import type { Secret } from "@/types";

async function deleteSecretWithStorage(
  id: string,
  storagePath?: string | null,
): Promise<void> {
  await db.delete(secrets).where(eq(secrets.id, id));
  if (storagePath) {
    try {
      await createStorageAdapter().delete(storagePath);
    } catch (err) {
      console.error("[validateSecret] Failed to delete storage file:", err);
    }
  }
}

export async function validateSecret(
  secret: Pick<
    NonNullable<Secret>,
    "id" | "viewCount" | "maxViews" | "expiresAt"
  > & { storagePath?: string | null },
) {
  const now = Date.now();
  if (secret.expiresAt.getTime() <= now) {
    await deleteSecretWithStorage(secret.id, secret.storagePath);
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Secret is expired",
    });
  }

  const hasViewLimit = secret.maxViews >= 1;
  if (hasViewLimit && secret.viewCount >= secret.maxViews) {
    await deleteSecretWithStorage(secret.id, secret.storagePath);
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Secret has reached the maximum amount of views",
    });
  }
}

const ID_TOKEN_VERSION = "v1" as const;

const base64urlEncode = (buf: Buffer): string =>
  buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const base64urlDecode = (input: string): Buffer => {
  const padLength = (4 - (input.length % 4)) % 4;
  const padded =
    input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLength);
  return Buffer.from(padded, "base64");
};

const urlIdEncKey = Buffer.from(env.URL_ID_ENC_KEY ?? "", "base64");

if (urlIdEncKey.length > 0 && urlIdEncKey.length !== 32) {
  throw new Error("URL_ID_ENC_KEY must be a 32-byte key encoded as base64");
}

export const encodeSecretIdToken = (id: string): string => {
  if (!env.URL_ID_ENC_KEY) {
    throw new Error("URL_ID_ENC_KEY must be set");
  }

  const plaintext = Buffer.from(id, "utf8");
  const iv = randomBytes(12);

  const cipher = createCipheriv("aes-256-gcm", urlIdEncKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const payload = Buffer.concat([iv, authTag, ciphertext]);
  return `${ID_TOKEN_VERSION}.${base64urlEncode(payload)}`;
};

export const decodeSecretIdToken = (token: string): string => {
  if (!env.URL_ID_ENC_KEY) {
    throw new Error("URL_ID_ENC_KEY must be set");
  }

  const [version, encoded] = token.split(".", 2);
  if (version !== ID_TOKEN_VERSION || !encoded) {
    throw new Error("Invalid id token format");
  }

  const payload = base64urlDecode(encoded);
  if (payload.length < 12 + 16 + 1) {
    throw new Error("Invalid id token payload");
  }

  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 12 + 16);
  const ciphertext = payload.subarray(12 + 16);

  const decipher = createDecipheriv("aes-256-gcm", urlIdEncKey, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
};

type CreatorFingerprintInput = {
  ip?: string;
  userAgent?: string;
  date?: Date;
};

export const getCreatorFingerprint = (
  input: CreatorFingerprintInput,
): string => {
  const salt = env.CREATOR_FINGERPRINT_SALT;
  if (!salt) {
    throw new Error("CREATOR_FINGERPRINT_SALT must be set");
  }

  const { ip = "", userAgent = "" } = input;
  const date = input.date;
  const dayBucket = date !== undefined ? date.toISOString().slice(0, 10) : null;

  const raw =
    dayBucket !== null
      ? `${ip}|${userAgent}|${dayBucket}`
      : `${ip}|${userAgent}`;
  const hmac = createHmac("sha256", salt);
  hmac.update(raw, "utf8");

  return base64urlEncode(hmac.digest());
};
