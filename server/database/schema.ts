import { index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

export const jobStatusEnum = pgEnum('job_status', [
  'waiting',
  'active',
  'completed',
  'failed',
  'delayed',
  'paused',
  'prioritized',
])

export const logLevelEnum = pgEnum('log_level', ['info', 'warn', 'error'])

export const serviceTypeEnum = pgEnum('service_type', [
  'worker',
  'webhook',
  'context-selector',
  'repo-indexer',
  'redis',
  'api',
])

export const jobs = pgTable('jobs', {
  id: text('id').primaryKey(),
  installationId: integer('installation_id').notNull(),
  repositoryFullName: text('repository_full_name').notNull(),
  pullRequestNumber: integer('pull_request_number').notNull(),
  status: jobStatusEnum('status').notNull().default('waiting'),
  attempts: integer('attempts').notNull().default(0),
  failedReason: text('failed_reason'),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('jobs_installation_id_created_at_idx').on(table.installationId, table.createdAt),
  index('jobs_status_idx').on(table.status),
])

export const logs = pgTable('logs', {
  id: serial('id').primaryKey(),
  installationId: integer('installation_id'),
  jobId: text('job_id'),
  service: serviceTypeEnum('service').notNull(),
  level: logLevelEnum('level').notNull(),
  message: text('message').notNull(),
  meta: jsonb('meta'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('logs_installation_id_created_at_idx').on(table.installationId, table.createdAt),
  index('logs_job_id_idx').on(table.jobId),
])

export type Job = typeof jobs.$inferSelect
export type NewJob = typeof jobs.$inferInsert
export type Log = typeof logs.$inferSelect
export type NewLog = typeof logs.$inferInsert
