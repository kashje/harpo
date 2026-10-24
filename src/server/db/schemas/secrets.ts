import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Everything the server stores is either ciphertext, a hash, or non-sensitive bookkeeping.
 * Encrypted values are base64url-encoded AES-256-GCM output; the keys never reach the server.
 */
export const secrets = pgTable(
  "secrets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Format version of the encrypted payload (see `src/lib/secret-crypto.ts`). */
    version: varchar("version", { length: 8 }).notNull(),
    type: varchar("type", { length: 8, enum: ["text", "file"] }).notNull(),
    /** Salted hash of the creator's IP, used to throttle people spamming new secrets. */
    identification: text("identification").notNull(),
    /** Encrypted metadata JSON: name, file name, MIME type. */
    metaCiphertext: text("meta_ciphertext").notNull(),
    metaIv: text("meta_iv").notNull(),
    /** Encrypted text content. `null` for files, whose ciphertext lives in storage. */
    contentCiphertext: text("content_ciphertext"),
    contentIv: text("content_iv").notNull(),
    /** PBKDF2 parameters; only set when the secret is passphrase protected. */
    passphraseSalt: text("passphrase_salt"),
    passphraseIterations: integer("passphrase_iterations"),
    /** scrypt hash of the auth token the client derives from the passphrase. */
    authTokenHash: text("auth_token_hash"),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    /** SHA-256 hash of the creator's delete token. */
    deleteTokenHash: text("delete_token_hash").notNull(),
    viewCount: integer("view_count").notNull().default(0),
    maxViews: integer("max_views").notNull().default(1),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("secrets_expires_at_idx").on(table.expiresAt)],
);
