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

export interface JobResult {
  jobs: EnrichedJob[]
  total: number
}

// Helper to determine status from raw Redis fields
function determineStatus(finishedOn: string | null, processedOn: string | null, failedReason: string | null, delay: string | null): JobStatus {
  if (finishedOn) {
    return failedReason ? JobStatus.FAILED : JobStatus.COMPLETED
  }
  if (processedOn) {
    return JobStatus.ACTIVE
  }
  if (delay) {
    return JobStatus.DELAYED
  }
  return JobStatus.WAITING
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

  async getTotalCount(installationIds: Set<number>): Promise<number> {
    if (!installationIds || installationIds.size === 0) {
      return 0
    }
    const redis = getRedisClient()
    const pipeline = redis.pipeline()
    for (const id of installationIds) {
      pipeline.zcard(`janusz:installation:${id}:jobs`)
    }
    const results = await pipeline.exec()
    return results?.reduce((acc, [err, count]) => acc + (err ? 0 : (count as number)), 0) || 0
  },

  /**
   * Efficiently retrieves paginated jobs with filtering.
   * Returns total count of visible/filtered jobs for pagination.
   */
  async getJobs(filter: JobFilter = {}): Promise<JobResult> {
    const { type, start = 0, end = 10, installationIds } = filter

    if (!installationIds || installationIds.size === 0) {
      return { jobs: [], total: 0 }
    }

    const redis = getRedisClient()
    const queue = getPrReviewQueue()
    const config = useRuntimeConfig()
    const queuePrefix = `bull:${config.queueName}`

    // 1. Fetch IDs and Scores (timestamps)
    // Scan up to 2500 most recent jobs
    const scanLimit = 2500
    const jobEntriesPromises = Array.from(installationIds).map(async (id) => {
      const key = `janusz:installation:${id}:jobs`
      return redis.zrevrange(key, 0, scanLimit, 'WITHSCORES')
    })

    const rawResults = await Promise.all(jobEntriesPromises)

    const allEntries: { id: string, score: number }[] = []
    for (const result of rawResults) {
      for (let i = 0; i < result.length; i += 2) {
        allEntries.push({
          id: result[i],
          score: Number(result[i + 1]),
        })
      }
    }

    // 2. Sort by Score Descending
    allEntries.sort((a, b) => b.score - a.score)

    // 3. Filter Logic (Pipeline Status Check)
    let targetEntries = allEntries

    // Optimization: Only run pipeline status checks if filtering is needed or if we want to confirm existence?
    // Actually, to guarantee consistency (since index might be stale vs Queue), checking status is good.
    // But for speed, if no filter, assume all exist.

    if (type && type.length > 0) {
      const pipeline = redis.pipeline()
      allEntries.forEach((entry) => {
        pipeline.hmget(`${queuePrefix}:${entry.id}`, 'finishedOn', 'processedOn', 'failedReason', 'delay')
      })
      const statusResults = await pipeline.exec()

      targetEntries = []
      statusResults?.forEach(([err, fields], index) => {
        if (err || !fields) {
          return
        }
        const [finishedOn, processedOn, failedReason, delay] = fields as [string | null, string | null, string | null, string | null]
        const status = determineStatus(finishedOn, processedOn, failedReason, delay)

        if (type.includes(status)) {
          targetEntries.push(allEntries[index])
        }
      })
    }

    const total = targetEntries.length

    // 4. Slice the requested page
    const pagedEntries = targetEntries.slice(start, end + 1)

    if (pagedEntries.length === 0) {
      return { jobs: [], total }
    }

    // 5. Fetch full job data only for the target page
    const fetchPromises = pagedEntries.map(async (entry) => {
      const job = await queue.getJob(entry.id)
      if (job) {
        const state = await job.getState() as JobStatus
        return {
          ...job.toJSON(),
          state,
          timestamp: job.timestamp,
        } as EnrichedJob
      }
      return null
    })

    const results = await Promise.all(fetchPromises)
    const validJobs = results.filter((j): j is EnrichedJob => j !== null)

    return { jobs: validJobs, total }
  },

  async getJobStats(installationIds: Set<number>, limit = 2500) {
    if (!installationIds || installationIds.size === 0) {
      return { waiting: 0, active: 0, failed: 0, delayed: 0, completed: 0 }
    }

    const redis = getRedisClient()
    const config = useRuntimeConfig()

    const jobIdsPromises = Array.from(installationIds).map(async (id) => {
      const key = `janusz:installation:${id}:jobs`
      return redis.zrevrange(key, 0, limit)
    })

    const jobIdsArrays = await Promise.all(jobIdsPromises)
    const allJobIds = new Set(jobIdsArrays.flat())

    if (allJobIds.size === 0) {
      return { waiting: 0, active: 0, failed: 0, delayed: 0, completed: 0 }
    }

    const pipeline = redis.pipeline()
    const queuePrefix = `bull:${config.queueName}`

    allJobIds.forEach((id) => {
      pipeline.hmget(`${queuePrefix}:${id}`, 'finishedOn', 'processedOn', 'failedReason', 'delay')
    })

    const results = await pipeline.exec()

    let waiting = 0
    let active = 0
    let failed = 0
    let delayed = 0
    let completed = 0

    results?.forEach(([err, fields]) => {
      if (err || !fields) {
        return
      }
      const [finishedOn, processedOn, failedReason, delay] = fields as [string | null, string | null, string | null, string | null]

      const status = determineStatus(finishedOn, processedOn, failedReason, delay)

      if (status === JobStatus.COMPLETED) {
        completed++
      } else if (status === JobStatus.FAILED) {
        failed++
      } else if (status === JobStatus.ACTIVE) {
        active++
      } else if (status === JobStatus.DELAYED) {
        delayed++
      } else {
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
