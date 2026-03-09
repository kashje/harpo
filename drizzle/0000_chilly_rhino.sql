CREATE TYPE "public"."file_type" AS ENUM('image', 'video', 'audio', 'document', 'other');--> statement-breakpoint
CREATE TABLE "secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"identification" text NOT NULL,
	"encrypted_payload" text NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"max_views" integer DEFAULT 1 NOT NULL,
	"file_type" "file_type",
	"password_hash" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
