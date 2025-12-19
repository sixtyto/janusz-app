import type { Job } from 'bullmq'

export default defineEventHandler(async () => {
  const limit = 100
  const queue = getPrReviewQueue()
  const filteredJobs = await queue.getJobs(['completed', 'failed', 'active', 'waiting'], 0, limit - 1, true)
  filteredJobs.sort((a: Job<PrReviewJobData>, b: Job<PrReviewJobData>) => {
    const timeA = a.finishedOn || a.timestamp
    const timeB = b.finishedOn || b.timestamp
    return timeB - timeA
  })

  return await Promise.all(filteredJobs.slice(0, 20).map(async (job) => {
    const state = await job.getState()
    return {
      id: job.id,
      name: job.name,
      status: state,
      result: job.returnvalue,
      error: job.failedReason,
      timestamp: job.finishedOn || job.timestamp,
      processedOn: job.processedOn,
      data: job.data,
    }
  }))
})
