DROP INDEX "logs_installation_id_idx";--> statement-breakpoint
DROP INDEX "logs_created_at_idx";--> statement-breakpoint
CREATE INDEX "jobs_installation_id_created_at_idx" ON "jobs" USING btree ("installation_id","created_at");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "logs_installation_id_created_at_idx" ON "logs" USING btree ("installation_id","created_at");--> statement-breakpoint
CREATE INDEX "logs_job_id_idx" ON "logs" USING btree ("job_id");