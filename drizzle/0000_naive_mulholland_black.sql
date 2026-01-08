CREATE TYPE "public"."job_status" AS ENUM('waiting', 'active', 'completed', 'failed', 'delayed');--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"installation_id" integer NOT NULL,
	"repository_full_name" text NOT NULL,
	"pull_request_number" integer NOT NULL,
	"status" "job_status" DEFAULT 'waiting' NOT NULL,
	"failed_reason" text,
	"processed_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
