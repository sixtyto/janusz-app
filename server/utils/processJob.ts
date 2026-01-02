import type { PrReviewJobData } from '#shared/types/PrReviewJobData'
import type { Job } from 'bullmq'
import { JobType } from '#shared/types/JobType'
import { handleReplyJob } from '~~/server/utils/replyService'
import { handleReviewJob } from '~~/server/utils/reviewService'

export async function processJob(job: Job<PrReviewJobData>) {
  const { type } = job.data

  if (type === JobType.REPLY) {
    await handleReplyJob(job)
    return
  }

  await handleReviewJob(job)
}
