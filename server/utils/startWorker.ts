import { ServiceType } from '#shared/types/ServiceType'
import { Worker } from 'bullmq'
import Redis from 'ioredis'

export function startWorker() {
  const config = useRuntimeConfig()
  const logger = createLogger(ServiceType.worker)

  const redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
  })

  const worker = new Worker<PrReviewJobData>(
    config.queueName,
    async (job) => {
      await processJob(job)
    },
    {
      connection: redis,
      concurrency: Number(config.concurrency),
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
