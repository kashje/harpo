import { getRedis } from "@/server/redis";

export type SecretType = "text" | "file";

/**
 * Everything the server stores is either ciphertext, a hash, or non-sensitive bookkeeping.
 * Encrypted values are base64url-encoded AES-256-GCM output; the keys never reach the server.
 *
 * Each secret is a Redis hash that expires at `expiresAt`. Redis runs without persistence, so a
 * restart drops every secret: a secret that was already viewed can never come back.
 */
export interface StoredSecret {
  /** Format version of the encrypted payload (see `src/lib/secret-crypto.ts`). */
  version: string;
  type: SecretType;
  /** Encrypted metadata JSON: name, file name, MIME type. */
  metaCiphertext: string;
  metaIv: string;
  /** Encrypted text content. `null` for files, whose ciphertext lives in storage. */
  contentCiphertext: string | null;
  contentIv: string;
  /** PBKDF2 parameters; only set when the secret is passphrase protected. */
  passphraseSalt: string | null;
  passphraseIterations: number | null;
  /** scrypt hash of the auth token the client derives from the passphrase. */
  authTokenHash: string | null;
  failedAttempts: number;
  /** SHA-256 hash of the creator's delete token. */
  deleteTokenHash: string;
  viewCount: number;
  /** `0` means unlimited. */
  maxViews: number;
  expiresAt: Date;
}

export type NewSecret = Omit<StoredSecret, "failedAttempts" | "viewCount">;

export const secretKey = (id: string) => `secret:${id}`;

/**
 * How long a file secret lingers after its last view. The download deletes it as soon as it has
 * read the file; this only bounds how long it stays when that delete never happens.
 */
const LAST_FILE_VIEW_TTL_MS = 5 * 60 * 1000;

// The scripts only return numbers, strings and arrays of those: Redis turns a Lua `false` into
// `null`, but ioredis-mock (used in the tests) doesn't.

/**
 * Counts one view unless the secret is gone or out of views, and returns
 * `{viewCount, maxViews, contentIv, contentCiphertext}`, or `0` when there is nothing to view.
 * The last view of a text secret deletes it right away.
 */
const CLAIM_VIEW_SCRIPT = `
if redis.call("EXISTS", KEYS[1]) == 0 then return 0 end
local maxViews = tonumber(redis.call("HGET", KEYS[1], "maxViews"))
local viewCount = tonumber(redis.call("HGET", KEYS[1], "viewCount"))
if maxViews > 0 and viewCount >= maxViews then return 0 end

viewCount = redis.call("HINCRBY", KEYS[1], "viewCount", 1)
local contentIv = redis.call("HGET", KEYS[1], "contentIv")
local content = redis.call("HGET", KEYS[1], "contentCiphertext") or ""

if maxViews > 0 and viewCount >= maxViews then
  if redis.call("HGET", KEYS[1], "type") == "file" then
    if redis.call("PTTL", KEYS[1]) > tonumber(ARGV[1]) then
      redis.call("PEXPIRE", KEYS[1], ARGV[1])
    end
  else
    redis.call("DEL", KEYS[1])
  end
end

return {viewCount, maxViews, contentIv, content}
`;

/** Returns the new number of failed attempts, or `0` when the secret is gone. */
const FAILED_ATTEMPT_SCRIPT = `
if redis.call("EXISTS", KEYS[1]) == 0 then return 0 end
return redis.call("HINCRBY", KEYS[1], "failedAttempts", 1)
`;

/** Returns `0` when the secret is gone, `1` when it was viewed and is kept, `2` when deleted. */
const DELETE_UNVIEWED_SCRIPT = `
if redis.call("EXISTS", KEYS[1]) == 0 then return 0 end
if tonumber(redis.call("HGET", KEYS[1], "viewCount")) > 0 then return 1 end
redis.call("DEL", KEYS[1])
return 2
`;

/** Deletes the secret and returns its type, or `""` when it was already gone. */
const DELETE_SCRIPT = `
local secretType = redis.call("HGET", KEYS[1], "type")
redis.call("DEL", KEYS[1])
return secretType or ""
`;

export async function createSecret(id: string, secret: NewSecret) {
  const fields: Record<string, string> = {
    viewCount: "0",
    failedAttempts: "0",
  };
  for (const [field, value] of Object.entries(secret)) {
    if (value === null) continue;
    fields[field] =
      value instanceof Date ? String(value.getTime()) : String(value);
  }

  const key = secretKey(id);
  const results = await getRedis()
    .multi()
    .hset(key, fields)
    .pexpireat(key, secret.expiresAt.getTime())
    .exec();

  const error = results?.find(([err]) => err)?.[0];
  if (!results || error) throw error ?? new Error("Transaction aborted");
}

export async function readSecret(id: string): Promise<StoredSecret | null> {
  const hash = await getRedis().hgetall(secretKey(id));
  if (!hash.type) return null;

  const optionalNumber = (value: string | undefined) =>
    value === undefined ? null : Number(value);

  return {
    version: hash.version ?? "",
    type: hash.type as SecretType,
    metaCiphertext: hash.metaCiphertext ?? "",
    metaIv: hash.metaIv ?? "",
    contentCiphertext: hash.contentCiphertext ?? null,
    contentIv: hash.contentIv ?? "",
    passphraseSalt: hash.passphraseSalt ?? null,
    passphraseIterations: optionalNumber(hash.passphraseIterations),
    authTokenHash: hash.authTokenHash ?? null,
    failedAttempts: Number(hash.failedAttempts ?? 0),
    deleteTokenHash: hash.deleteTokenHash ?? "",
    viewCount: Number(hash.viewCount ?? 0),
    maxViews: Number(hash.maxViews ?? 0),
    expiresAt: new Date(Number(hash.expiresAt)),
  };
}

/**
 * Counts one view, atomically: concurrent requests can never get more views than `maxViews`.
 * Returns `null` when the secret is gone, expired or out of views.
 */
export async function claimSecretView(id: string) {
  const result = await getRedis().eval(
    CLAIM_VIEW_SCRIPT,
    1,
    secretKey(id),
    LAST_FILE_VIEW_TTL_MS,
  );
  if (!Array.isArray(result)) return null;

  const [viewCount, maxViews, contentIv, contentCiphertext] = result as [
    number,
    number,
    string,
    string,
  ];
  return {
    viewCount,
    maxViews,
    contentIv,
    contentCiphertext: contentCiphertext || null,
  };
}

/** Returns the new number of failed passphrase attempts, or `null` when the secret is gone. */
export async function recordFailedAttempt(id: string): Promise<number | null> {
  const attempts = Number(
    await getRedis().eval(FAILED_ATTEMPT_SCRIPT, 1, secretKey(id)),
  );
  return attempts > 0 ? attempts : null;
}

/** Deletes the secret only if nobody viewed it yet. */
export async function deleteUnviewedSecret(
  id: string,
): Promise<"deleted" | "viewed" | "gone"> {
  const result = Number(
    await getRedis().eval(DELETE_UNVIEWED_SCRIPT, 1, secretKey(id)),
  );
  if (result === 2) return "deleted";
  return result === 1 ? "viewed" : "gone";
}

/** Deletes the secret's record and returns its type, or `null` when it was already gone. */
export async function deleteSecretRecord(
  id: string,
): Promise<SecretType | null> {
  const type = await getRedis().eval(DELETE_SCRIPT, 1, secretKey(id));
  return type === "text" || type === "file" ? type : null;
}

const EXISTS_BATCH_SIZE = 500;

/** The subset of `ids` that still have a secret. Throws when Redis can't answer for all of them. */
export async function existingSecretIds(ids: string[]): Promise<Set<string>> {
  const existing = new Set<string>();

  for (let i = 0; i < ids.length; i += EXISTS_BATCH_SIZE) {
    const batch = ids.slice(i, i + EXISTS_BATCH_SIZE);
    const pipeline = getRedis().pipeline();
    for (const id of batch) pipeline.exists(secretKey(id));

    const results = await pipeline.exec();
    if (results?.length !== batch.length) {
      throw new Error("Incomplete EXISTS pipeline result");
    }
    results.forEach(([err, count], index) => {
      if (err) throw err;
      if (Number(count) > 0) existing.add(batch[index]!);
    });
  }

  return existing;
}
