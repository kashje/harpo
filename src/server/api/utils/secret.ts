import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

import { eq } from "drizzle-orm";

import { env } from "@/env";
import { DELETE_TOKEN_BYTES } from "@/lib/secret-options";
import { db } from "@/server/db";
import { secrets } from "@/server/db/schemas/secrets";
import { createStorageAdapter } from "@/server/storage";

export const secretFilePath = (id: string) => `secrets/${id}/file`;

/** Deletes a secret's stored file. Failures are logged; the sweeper can't retry them. */
export async function deleteSecretFile(id: string): Promise<void> {
  try {
    await createStorageAdapter().delete(secretFilePath(id));
  } catch (err) {
    console.error("[deleteSecretFile] Failed to delete storage file:", err);
  }
}

/** Deletes a secret and, for file secrets, its stored file. No-op if it's already gone. */
export async function deleteSecret(id: string): Promise<void> {
  const [deleted] = await db
    .delete(secrets)
    .where(eq(secrets.id, id))
    .returning({ type: secrets.type });

  if (deleted?.type === "file") {
    await deleteSecretFile(id);
  }
}

export const isSecretUnavailable = (
  secret: { expiresAt: Date; viewCount: number; maxViews: number },
  now = new Date(),
) =>
  secret.expiresAt.getTime() <= now.getTime() ||
  (secret.maxViews > 0 && secret.viewCount >= secret.maxViews);

const ID_TOKEN_VERSION = "v1" as const;

// Read lazily: builds run with SKIP_ENV_VALIDATION and no key. env.js validates it at runtime.
let urlIdEncKeyCache: Buffer | undefined;
const urlIdEncKey = () =>
  (urlIdEncKeyCache ??= Buffer.from(env.URL_ID_ENC_KEY, "base64"));

export const encodeSecretIdToken = (id: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", urlIdEncKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(id, "utf8")),
    cipher.final(),
  ]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  return `${ID_TOKEN_VERSION}.${payload.toString("base64url")}`;
};

export const decodeSecretIdToken = (token: string): string => {
  const [version, encoded] = token.split(".", 2);
  if (version !== ID_TOKEN_VERSION || !encoded) {
    throw new Error("Invalid id token format");
  }

  const payload = Buffer.from(encoded, "base64url");
  if (payload.length < 12 + 16 + 1) {
    throw new Error("Invalid id token payload");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    urlIdEncKey(),
    payload.subarray(0, 12),
  );
  decipher.setAuthTag(payload.subarray(12, 12 + 16));

  return Buffer.concat([
    decipher.update(payload.subarray(12 + 16)),
    decipher.final(),
  ]).toString("utf8");
};

/** Like `decodeSecretIdToken`, but returns `null` instead of throwing. */
export const tryDecodeSecretIdToken = (token: string): string | null => {
  try {
    return decodeSecretIdToken(token);
  } catch {
    return null;
  }
};

/**
 * Returns the client IP from `X-Forwarded-For`.
 *
 * Only the right-most entries are trustworthy: each proxy appends the address it received the
 * request from, while everything to the left can be set by the client. With `trustedProxies`
 * proxies in front of Harpo, the client IP is the entry the outermost proxy appended. Without a
 * proxy, Next.js only fills the header with the socket address when the client didn't send one,
 * so run Harpo behind a reverse proxy in production.
 */
export const getClientIp = (
  headers: Headers,
  trustedProxies = env.TRUSTED_PROXY_COUNT,
): string => {
  const forwarded = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);

  if (forwarded.length === 0) return "";

  const index = Math.max(forwarded.length - Math.max(trustedProxies, 1), 0);
  return forwarded[index] ?? "";
};

/**
 * Salted hash of the client IP, so rate limits and the per-creator throttle work without storing
 * IP addresses. With `date` the hash also changes daily, which is what gets stored per secret.
 */
export const getCreatorFingerprint = (input: {
  ip: string;
  date?: Date;
}): string => {
  const raw = input.date
    ? `${input.ip}|${input.date.toISOString().slice(0, 10)}`
    : input.ip;

  return createHmac("sha256", env.CREATOR_FINGERPRINT_SALT)
    .update(raw, "utf8")
    .digest("base64url");
};

export const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
};

/** Delete tokens are 256-bit random values, so a plain SHA-256 is enough to store them. */
export const generateDeleteToken = (): string =>
  randomBytes(DELETE_TOKEN_BYTES).toString("base64url");

export const hashDeleteToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("base64url");

const AUTH_HASH_VERSION = "s1";
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

const scryptAsync = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 32, SCRYPT_PARAMS, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });

/**
 * The auth token is already PBKDF2 output, but it derives from a human passphrase, so it gets a
 * salted slow hash too. A leaked database then still needs PBKDF2 + scrypt per guess.
 */
export async function hashAuthToken(token: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(token, salt);
  return `${AUTH_HASH_VERSION}.${salt.toString("base64url")}.${hash.toString("base64url")}`;
}

export async function verifyAuthToken(
  token: string,
  stored: string,
): Promise<boolean> {
  const [version, salt, hash] = stored.split(".");
  if (version !== AUTH_HASH_VERSION || !salt || !hash) return false;

  const expected = Buffer.from(hash, "base64url");
  const actual = await scryptAsync(token, Buffer.from(salt, "base64url"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
