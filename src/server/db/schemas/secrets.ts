import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

export const secrets = pgTable("secrets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  identification: text("identification").notNull(),
  encryptedPayload: text("encrypted_payload").notNull(),
  viewCount: integer("view_count").notNull().default(0),
  maxViews: integer("max_views").notNull().default(1),
  passwordHash: text("password_hash"),
  taggedDeletionAt: timestamp("taggedDeletionAt"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
