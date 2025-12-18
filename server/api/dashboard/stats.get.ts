export default defineEventHandler(async () => {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    prReviewQueue.getWaitingCount(),
    prReviewQueue.getActiveCount(),
    prReviewQueue.getCompletedCount(),
    prReviewQueue.getFailedCount(),
    prReviewQueue.getDelayedCount(),
  ])

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
  }
})
