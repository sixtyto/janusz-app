import { Worker } from 'bullmq'
import Redis from 'ioredis'
import { config } from './config.js'

const logger = createLogger('worker')

export function startWorker() {
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
  })

  const worker = new Worker<PrReviewJobData>(
    config.QUEUE_NAME,
    async (job) => {
      await processJob(job)
    },
    {
      connection: redis,
      concurrency: config.CONCURRENCY,
      limiter: {
        max: 10,
        duration: 1000,
      },
    },
  )

  worker.on('completed', (job) => {
    logger.info(`✅ Job ${job.id} completed for ${job.data.repositoryFullName}#${job.data.prNumber}`, { jobId: job.id })
  })

  worker.on('failed', (job, err) => {
    logger.error(`❌ Job ${job?.id} failed:`, { error: err, jobId: job?.id })
  })

  worker.on('error', (err) => {
    logger.error('Worker error:', { error: err })
  })

  return {
    close: async () => {
      await worker.close()
      await redis.quit()
    },
  }
}
