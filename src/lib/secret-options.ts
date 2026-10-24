/**
 * Options and limits shared between the browser and the server. Both sides validate against
 * these values, so keep them in one place.
 */

export const EXPIRES_IN_VALUES = ["1h", "24h", "3d", "7d", "30d"] as const;
export type ExpiresIn = (typeof EXPIRES_IN_VALUES)[number];

export const EXPIRES_IN_MS: Record<ExpiresIn, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export const MAX_VIEWS_VALUES = ["1", "3", "5", "10", "unlimited"] as const;
export type MaxViews = (typeof MAX_VIEWS_VALUES)[number];

/** `0` means unlimited views. */
export const MAX_VIEWS_COUNT: Record<MaxViews, number> = {
  "1": 1,
  "3": 3,
  "5": 5,
  "10": 10,
  unlimited: 0,
};

/** Maximum size of a text secret in bytes (UTF-8). */
export const MAX_TEXT_SECRET_BYTES = 64 * 1024;

/** Maximum size of the encrypted metadata (name, file name, MIME type) in bytes. */
export const MAX_META_BYTES = 2 * 1024;

/** Wrong passphrase attempts allowed before the secret is destroyed. */
export const MAX_PASSPHRASE_ATTEMPTS = 5;

/** PBKDF2-SHA256 iterations used when creating a passphrase-protected secret. */
export const PBKDF2_ITERATIONS = 600_000;
/** Bounds the server accepts, so a creator can't make recipients' browsers hang. */
export const PBKDF2_MIN_ITERATIONS = 100_000;
export const PBKDF2_MAX_ITERATIONS = 2_000_000;

export const AES_GCM_IV_BYTES = 12;
export const AES_GCM_TAG_BYTES = 16;
export const LINK_KEY_BYTES = 32;
export const PASSPHRASE_SALT_BYTES = 16;
export const AUTH_TOKEN_BYTES = 32;
export const DELETE_TOKEN_BYTES = 32;

/** Files are encrypted in chunks of this size, so the browser never holds a whole file at once. */
export const FILE_CHUNK_BYTES = 1024 * 1024;

/**
 * Size of a file of `bytes` bytes once encrypted: every chunk gets an AES-GCM tag, and even an empty
 * file is one (empty) chunk.
 */
export const encryptedFileSize = (bytes: number) =>
  bytes + AES_GCM_TAG_BYTES * Math.max(1, Math.ceil(bytes / FILE_CHUNK_BYTES));

/** Length of the unpadded base64url encoding of `bytes` bytes. */
export const base64urlLength = (bytes: number) => Math.ceil((bytes * 4) / 3);
