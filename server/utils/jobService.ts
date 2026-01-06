import type { JobJson } from 'bullmq'
import { JobStatus } from '#shared/types/JobStatus'

export interface JobFilter {
  type?: JobStatus[]
  start?: number
  end?: number
  installationIds?: Set<number>
}

export interface EnrichedJob extends JobJson {
  state: JobStatus | 'unknown'
  timestamp: number
}

export const jobService = {
  async indexJob(installationId: number, jobId: string) {
    const redis = getRedisClient()
    const key = `janusz:installation:${installationId}:jobs`
    await redis.zadd(key, Date.now(), jobId)
    // Keep last 1000 jobs per installation index
    await redis.zremrangebyrank(key, 0, -1001)
  },

  async getJob(jobId: string) {
    return getPrReviewQueue().getJob(jobId)
  },

  async getJobs(filter: JobFilter = {}): Promise<EnrichedJob[]> {
    const { type = [JobStatus.ACTIVE, JobStatus.WAITING, JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.DELAYED], start = 0, end = 10, installationIds } = filter

    if (!installationIds || installationIds.size === 0) {
      return []
    }

    const redis = getRedisClient()
    const queue = getPrReviewQueue()

    // 1. Fetch job IDs from all relevant installation indices
    const jobIdsPromises = Array.from(installationIds).map(async (id) => {
      const key = `janusz:installation:${id}:jobs`
      return redis.zrevrange(key, 0, end + 100)
    })

    const jobIdsArrays = await Promise.all(jobIdsPromises)
    const allJobIds = new Set(jobIdsArrays.flat())

    // 2. Fetch Job objects efficiently
    const fetchPromises = Array.from(allJobIds).map(async (jobId) => {
      const job = await queue.getJob(jobId)
      if (job) {
        const state = await job.getState() as JobStatus
        if (type.includes(state)) {
          return {
            ...job.toJSON(),
            state,
            timestamp: job.timestamp,
          } as EnrichedJob
        }
      }
      return null
    })

    const results = await Promise.all(fetchPromises)
    const validJobs = results.filter((j): j is EnrichedJob => j !== null)

    // 3. Sort by timestamp descending
    validJobs.sort((a, b) => b.timestamp - a.timestamp)

    // 4. Paginate
    return validJobs.slice(start, end + 1)
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
    return true
  },

  async getJobCounts() {
    return getPrReviewQueue().getJobCounts()
  },
}
