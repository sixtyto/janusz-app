CREATE TYPE "public"."severity_threshold" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TABLE "repository_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"installation_id" integer NOT NULL,
	"repository_full_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"settings" jsonb DEFAULT '{"customPrompts":{},"severityThreshold":"medium","excludedPatterns":[],"preferredModel":"default"}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "repository_settings_installation_id_idx" ON "repository_settings" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "repository_settings_repository_full_name_idx" ON "repository_settings" USING btree ("repository_full_name");--> statement-breakpoint
CREATE INDEX "repository_settings_installation_repository_idx" ON "repository_settings" USING btree ("installation_id","repository_full_name");