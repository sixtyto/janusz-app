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

  /**
   * Efficiently retrieves paginated jobs.
   * 1. Fetches IDs + Timestamps (Scores) from Redis ZSETs.
   * 2. Merges and sorts IDs in memory.
   * 3. Slices the requested page.
   * 4. Fetches full Job data ONLY for the sliced IDs.
   */
  async getJobs(filter: JobFilter = {}): Promise<EnrichedJob[]> {
    const { type = [JobStatus.ACTIVE, JobStatus.WAITING, JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.DELAYED], start = 0, end = 10, installationIds } = filter

    if (!installationIds || installationIds.size === 0) {
      return []
    }

    const redis = getRedisClient()
    const queue = getPrReviewQueue()

    // 1. Fetch IDs and Scores (timestamps)
    const jobEntriesPromises = Array.from(installationIds).map(async (id) => {
      const key = `janusz:installation:${id}:jobs`
      // Fetch up to 'end' because we need to merge potentially interleaved lists
      return redis.zrevrange(key, 0, end, 'WITHSCORES')
    })

    const rawResults = await Promise.all(jobEntriesPromises)

    // Parse flat array [id, score, id, score...] into objects
    const allEntries: { id: string, score: number }[] = []

    for (const result of rawResults) {
      for (let i = 0; i < result.length; i += 2) {
        allEntries.push({
          id: result[i],
          score: Number(result[i + 1]),
        })
      }
    }

    // 2. Sort by Score (Timestamp) Descending
    allEntries.sort((a, b) => b.score - a.score)

    // 3. Slice the requested page
    const pagedEntries = allEntries.slice(start, end + 1)

    if (pagedEntries.length === 0) {
      return []
    }

    // 4. Fetch full job data only for the target page
    const fetchPromises = pagedEntries.map(async (entry) => {
      const job = await queue.getJob(entry.id)
      if (job) {
        const state = await job.getState() as JobStatus
        if (type && type.length > 0 && !type.includes(state)) {
          return null
        }
        return {
          ...job.toJSON(),
          state,
          timestamp: job.timestamp,
        } as EnrichedJob
      }
      return null
    })

    const results = await Promise.all(fetchPromises)
    return results.filter((j): j is EnrichedJob => j !== null)
  },

  /**
   * Retrieves status counts efficiently using Redis Pipeline.
   * Avoids fetching job bodies.
   */
  async getJobStats(installationIds: Set<number>, limit = 2500) {
    if (!installationIds || installationIds.size === 0) {
      return { waiting: 0, active: 0, failed: 0, delayed: 0, completed: 0 }
    }

    const redis = getRedisClient()
    const config = useRuntimeConfig()

    // 1. Get all IDs (up to limit)
    const jobIdsPromises = Array.from(installationIds).map(async (id) => {
      const key = `janusz:installation:${id}:jobs`
      return redis.zrevrange(key, 0, limit)
    })

    const jobIdsArrays = await Promise.all(jobIdsPromises)
    const allJobIds = new Set(jobIdsArrays.flat())

    if (allJobIds.size === 0) {
      return { waiting: 0, active: 0, failed: 0, delayed: 0, completed: 0 }
    }

    // 2. Pipeline fetch minimal fields to infer status
    const pipeline = redis.pipeline()
    const queuePrefix = `bull:${config.queueName}` // Assuming default prefix 'bull'

    allJobIds.forEach((id) => {
      pipeline.hmget(`${queuePrefix}:${id}`, 'finishedOn', 'processedOn', 'failedReason', 'delay')
    })

    const results = await pipeline.exec()

    let waiting = 0
    let active = 0
    let failed = 0
    const delayed = 0
    let completed = 0

    results?.forEach(([err, fields]) => {
      if (err || !fields) {
        return
      }
      const [finishedOn, processedOn, failedReason] = fields as [string | null, string | null, string | null]

      if (finishedOn) {
        if (failedReason) {
          failed++
        } else {
          completed++
        }
      } else if (processedOn) {
        active++
      } else {
        // Simple heuristic: if not processed and not finished, it's waiting or delayed
        waiting++
      }
    })

    return { waiting, active, failed, delayed, completed }
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
