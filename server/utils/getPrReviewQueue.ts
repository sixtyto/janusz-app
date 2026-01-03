import { Queue } from 'bullmq'

let _prReviewQueue: Queue | undefined

export function getPrReviewQueue() {
  if (!_prReviewQueue) {
    const config = useRuntimeConfig()
    _prReviewQueue = new Queue(config.queueName, {
      connection: getRedisClient(),
      defaultJobOptions: {
        removeOnComplete: {
          count: 1000,
        },
        removeOnFail: {
          count: 1000,
        },
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 30_000,
        },
      },
    })
  }
  return _prReviewQueue
}
