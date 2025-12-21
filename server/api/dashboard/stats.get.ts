export default defineEventHandler(async () => {
  const queue = getPrReviewQueue()
  const [waiting, active, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ])

  return {
    waiting,
    active,
    failed,
    delayed,
  }
})
