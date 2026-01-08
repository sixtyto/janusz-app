import type { PrReviewJobData } from '#shared/types/PrReviewJobData'
import { JobStatus } from '#shared/types/JobStatus'
import { ServiceType } from '#shared/types/ServiceType'
import { Worker } from 'bullmq'
import { jobService } from '~~/server/utils/jobService'
import { processJob } from '~~/server/utils/processJob'
import { useLogger } from '~~/server/utils/useLogger'

export function startWorker() {
  const config = useRuntimeConfig()
  const logger = useLogger(ServiceType.worker)

  const worker = new Worker<PrReviewJobData>(
    config.queueName,
    async (job) => {
      if (job.id) {
        await jobService.updateJobStatus(job.id, JobStatus.ACTIVE)
      }
      await processJob(job)
    },
    {
      connection: {
        url: config.redisUrl,
        maxRetriesPerRequest: null,
      },
      concurrency: Number(config.concurrency),
      limiter: {
        max: 10,
        duration: 1000,
      },
    },
  )

  worker.on('completed', (job) => {
    void (async () => {
      if (job.id) {
        await jobService.updateJobStatus(job.id, JobStatus.COMPLETED)
      }
      logger.info(`✅ Job ${job.id} completed for ${job.data.repositoryFullName}#${job.data.prNumber}`, { jobId: job.id })
    })()
  })

  worker.on('failed', (job, err) => {
    void (async () => {
      if (job?.id) {
        await jobService.updateJobStatus(job.id, JobStatus.FAILED, err.message)
      }
      logger.error(`❌ Job ${job?.id} failed:`, { error: err, jobId: job?.id })
    })()
  })

  worker.on('error', (err) => {
    logger.error('Worker error:', { error: err })
  })

  return {
    close: async () => {
      await worker.close()
    },
  }
}
