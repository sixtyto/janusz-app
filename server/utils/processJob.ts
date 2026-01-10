import type { PrReviewJobData } from '#shared/types/PrReviewJobData'
import type { Job } from 'bullmq'
import { JobType } from '#shared/types/JobType'
import { jobContextStorage } from '~~/server/utils/jobContext'
import { handleReplyJob } from '~~/server/utils/replyService'
import { handleReviewJob } from '~~/server/utils/reviewService'

export async function processJob(job: Job<PrReviewJobData>) {
  const { type, installationId } = job.data

  await jobContextStorage.run({ jobId: job.id!, installationId }, async () => {
    if (type === JobType.REPLY) {
      await handleReplyJob(job)
      return
    }

    await handleReviewJob(job)
  })
}
