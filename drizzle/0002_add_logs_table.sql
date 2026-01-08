CREATE TYPE "public"."log_level" AS ENUM('info', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."service_type" AS ENUM('worker', 'webhook', 'context-selector', 'repo-indexer', 'redis', 'api');--> statement-breakpoint
CREATE TABLE "logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"installation_id" integer NOT NULL,
	"job_id" text,
	"service" "service_type" NOT NULL,
	"level" "log_level" NOT NULL,
	"message" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "logs_installation_id_idx" ON "logs" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "logs_created_at_idx" ON "logs" USING btree ("created_at");