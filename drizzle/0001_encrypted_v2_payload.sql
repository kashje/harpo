-- v1 secrets cannot be read by the v2 client (plaintext metadata, old key scheme), so drop them.
DELETE FROM "secrets";--> statement-breakpoint
ALTER TABLE "secrets" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "secrets" DROP COLUMN "encrypted_payload";--> statement-breakpoint
ALTER TABLE "secrets" DROP COLUMN "password_hash";--> statement-breakpoint
ALTER TABLE "secrets" DROP COLUMN "taggedDeletionAt";--> statement-breakpoint
ALTER TABLE "secrets" ADD COLUMN "version" varchar(8) NOT NULL;--> statement-breakpoint
ALTER TABLE "secrets" ADD COLUMN "type" varchar(8) NOT NULL;--> statement-breakpoint
ALTER TABLE "secrets" ADD COLUMN "meta_ciphertext" text NOT NULL;--> statement-breakpoint
ALTER TABLE "secrets" ADD COLUMN "meta_iv" text NOT NULL;--> statement-breakpoint
ALTER TABLE "secrets" ADD COLUMN "content_ciphertext" text;--> statement-breakpoint
ALTER TABLE "secrets" ADD COLUMN "content_iv" text NOT NULL;--> statement-breakpoint
ALTER TABLE "secrets" ADD COLUMN "passphrase_salt" text;--> statement-breakpoint
ALTER TABLE "secrets" ADD COLUMN "passphrase_iterations" integer;--> statement-breakpoint
ALTER TABLE "secrets" ADD COLUMN "auth_token_hash" text;--> statement-breakpoint
ALTER TABLE "secrets" ADD COLUMN "failed_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "secrets" ADD COLUMN "delete_token_hash" text NOT NULL;--> statement-breakpoint
CREATE INDEX "secrets_expires_at_idx" ON "secrets" USING btree ("expires_at");