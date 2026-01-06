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

export const JOB_CHUNK_SIZE = 500
export const JOB_SCAN_LIMIT = 2500
export const JOB_STATS_SCAN_LIMIT = 2500
export const MAX_JOBS_PER_INSTALLATION = 1000

function determineStatus(finishedOn: string | null, processedOn: string | null, failedReason: string | null, delay: string | null): JobStatus | null {
  if (finishedOn === null && processedOn === null && failedReason === null && delay === null) {
    return null
  }

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

function chunkArray<T>(array: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size))
  }
  return result
}

export const jobService = {
  async indexJob(installationId: number, jobId: string) {
    const redis = getRedisClient()
    const key = `janusz:installation:${installationId}:jobs`
    await redis.zadd(key, Date.now(), jobId)
    await redis.zremrangebyrank(key, 0, -MAX_JOBS_PER_INSTALLATION - 1)
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

  async getJobs(filter: JobFilter = {}): Promise<JobResult> {
    const { type, start = 0, end = 10, installationIds } = filter

    if (!installationIds || installationIds.size === 0) {
      return { jobs: [], total: 0 }
    }

    const redis = getRedisClient()
    const queue = getPrReviewQueue()
    const config = useRuntimeConfig()
    const queuePrefix = `bull:${config.queueName}`

    const jobEntriesPromises = Array.from(installationIds).map(async (id) => {
      const key = `janusz:installation:${id}:jobs`
      return redis.zrevrange(key, 0, JOB_SCAN_LIMIT, 'WITHSCORES')
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

    allEntries.sort((a, b) => b.score - a.score)

    const chunks = chunkArray(allEntries, JOB_CHUNK_SIZE)
    const targetEntries: typeof allEntries = []

    const chunkPromises = chunks.map(async (chunk) => {
      const pipeline = redis.pipeline()
      chunk.forEach((entry) => {
        pipeline.hmget(`${queuePrefix}:${entry.id}`, 'finishedOn', 'processedOn', 'failedReason', 'delay')
      })
      const statusResults = await pipeline.exec()

      const chunkValidEntries: typeof allEntries = []
      statusResults?.forEach(([err, fields], index) => {
        if (err || !fields) {
          return
        }
        const [finishedOn, processedOn, failedReason, delay] = fields as [string | null, string | null, string | null, string | null]
        const status = determineStatus(finishedOn, processedOn, failedReason, delay)

        if (status !== null) {
          if (!type || type.length === 0 || type.includes(status)) {
            chunkValidEntries.push(chunk[index])
          }
        }
      })
      return chunkValidEntries
    })

    const processedChunks = await Promise.all(chunkPromises)
    processedChunks.forEach(chunkRes => targetEntries.push(...chunkRes))

    const total = targetEntries.length

    const pagedEntries = targetEntries.slice(start, end + 1)

    if (pagedEntries.length === 0) {
      return { jobs: [], total }
    }

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

  async getJobStats(installationIds: Set<number>, limit = JOB_STATS_SCAN_LIMIT) {
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
    const allJobIdsArray = jobIdsArrays.flat()

    if (allJobIdsArray.length === 0) {
      return { waiting: 0, active: 0, failed: 0, delayed: 0, completed: 0 }
    }

    const chunks = chunkArray(allJobIdsArray, JOB_CHUNK_SIZE)
    const queuePrefix = `bull:${config.queueName}`

    let waiting = 0
    let active = 0
    let failed = 0
    let delayed = 0
    let completed = 0

    const chunkPromises = chunks.map(async (chunk) => {
      const pipeline = redis.pipeline()
      chunk.forEach((id) => {
        pipeline.hmget(`${queuePrefix}:${id}`, 'finishedOn', 'processedOn', 'failedReason', 'delay')
      })
      const results = await pipeline.exec()

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
        } else if (status === JobStatus.WAITING) {
          waiting++
        }
      })
    })

    await Promise.all(chunkPromises)

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
