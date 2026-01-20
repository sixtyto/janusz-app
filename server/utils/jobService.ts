import type { JobDto } from '#shared/types/JobDto'
import type { Job, jobStatusEnum } from '../database/schema'
import { JobStatus } from '#shared/types/JobStatus'
import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { jobs } from '../database/schema'
import { getPrReviewQueue } from './getPrReviewQueue'
import { useDatabase } from './useDatabase'

type DatabaseJobStatus = (typeof jobStatusEnum.enumValues)[number]

export interface JobFilter {
  type?: JobStatus[]
  start?: number
  end?: number
  installationIds?: Set<number>
}

export interface JobResult {
  jobs: JobDto[]
  total: number
}

export const jobService = {
  async createJob(jobId: string, installationId: number, repositoryFullName: string, pullRequestNumber: number): Promise<boolean> {
    const database = useDatabase()
    const result = await database.insert(jobs).values({
      id: jobId,
      installationId,
      repositoryFullName,
      pullRequestNumber,
      status: JobStatus.WAITING as DatabaseJobStatus,
    }).onConflictDoNothing().returning({ id: jobs.id })

    return result.length > 0
  },

  async updateJobStatus(jobId: string, status: JobStatus, failedReason?: string, attempts?: number) {
    const database = useDatabase()
    const now = new Date()

    const updateData: Partial<typeof jobs.$inferInsert> = {
      status: status as DatabaseJobStatus,
      updatedAt: now,
    }

    if (attempts !== undefined) {
      updateData.attempts = attempts
    }

    if (status === JobStatus.ACTIVE) {
      updateData.processedAt = now
    }
    if (status === JobStatus.COMPLETED || status === JobStatus.FAILED) {
      updateData.finishedAt = now
    }
    if (failedReason) {
      updateData.failedReason = failedReason
    }

    await database.update(jobs).set(updateData).where(eq(jobs.id, jobId))
  },

  async getJob(jobId: string) {
    return getPrReviewQueue().getJob(jobId)
  },

  async getJobFromDatabase(jobId: string) {
    const database = useDatabase()
    return database.query.jobs.findFirst({ where: eq(jobs.id, jobId) }) ?? null
  },

  async getTotalCount(installationIds: Set<number>): Promise<number> {
    if (!installationIds || installationIds.size === 0) {
      return 0
    }
    const database = useDatabase()
    const result = await database
      .select({ count: count() })
      .from(jobs)
      .where(inArray(jobs.installationId, Array.from(installationIds)))
    return result[0]?.count ?? 0
  },

  async getJobs(filter: JobFilter = {}): Promise<JobResult> {
    const { type, start = 0, end = 10, installationIds } = filter

    if (!installationIds || installationIds.size === 0) {
      return { jobs: [], total: 0 }
    }

    const database = useDatabase()
    const installationIdArray = Array.from(installationIds)
    const limit = end - start + 1
    const offset = start

    const conditions = [inArray(jobs.installationId, installationIdArray)]

    if (type && type.length > 0) {
      const databaseStatuses = type.map(status => status as DatabaseJobStatus)
      conditions.push(inArray(jobs.status, databaseStatuses))
    }

    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions)

    const [countResult, jobRecords] = await Promise.all([
      database.select({ count: count() }).from(jobs).where(whereClause),
      database.select().from(jobs).where(whereClause).orderBy(desc(jobs.createdAt)).limit(limit).offset(offset),
    ])

    const total = countResult[0]?.count ?? 0

    if (jobRecords.length === 0) {
      return { jobs: [], total }
    }

    const enrichedJobs: JobDto[] = jobRecords.map((record: Job) => ({
      id: record.id,
      name: 'review-job',
      data: {
        repositoryFullName: record.repositoryFullName,
        installationId: record.installationId,
        prNumber: record.pullRequestNumber,
      },
      repositoryFullName: record.repositoryFullName,
      attemptsMade: record.attempts,
      failedReason: record.failedReason ?? undefined,
      processedAt: record.processedAt?.toISOString(),
      finishedAt: record.finishedAt?.toISOString(),
      state: record.status as JobStatus,
      progress: 0,
      timestamp: record.createdAt.toISOString(),
    }))

    return { jobs: enrichedJobs, total }
  },

  async getJobStats(installationIds: Set<number>) {
    if (!installationIds || installationIds.size === 0) {
      return { waiting: 0, active: 0, failed: 0, delayed: 0, completed: 0, paused: 0, prioritized: 0 }
    }

    const database = useDatabase()
    const result = await database
      .select({
        status: jobs.status,
        count: count(),
      })
      .from(jobs)
      .where(inArray(jobs.installationId, Array.from(installationIds)))
      .groupBy(jobs.status)

    const stats: Record<DatabaseJobStatus, number> = {
      waiting: 0,
      active: 0,
      failed: 0,
      delayed: 0,
      completed: 0,
      paused: 0,
      prioritized: 0,
    }
    for (const row of result) {
      const status = row.status
      if (status in stats) {
        stats[status] = row.count
      }
    }
    return stats
  },

  async retryJob(jobId: string) {
    const job = await getPrReviewQueue().getJob(jobId)
    if (!job) {
      throw new Error('Job not found')
    }

    const state = await job.getState()
    if (state !== JobStatus.FAILED) {
      throw new Error(`Cannot retry job in ${state} state`)
    }

    await job.retry()
    await this.updateJobStatus(jobId, JobStatus.WAITING)
    return job
  },

  async deleteJob(jobId: string) {
    const job = await getPrReviewQueue().getJob(jobId)
    if (!job) {
      throw new Error('Job not found')
    }

    const state = await job.getState()
    if (state === JobStatus.ACTIVE) {
      throw new Error('Cannot delete active job')
    }

    await job.remove()

    const database = useDatabase()
    await database.delete(jobs).where(eq(jobs.id, jobId))

    return true
  },

  async getJobCounts() {
    return getPrReviewQueue().getJobCounts()
  },
}
