import { Queue } from 'bullmq'

let _prReviewQueue: Queue | undefined

export function getPrReviewQueue() {
  if (!_prReviewQueue) {
    const config = useRuntimeConfig()
    _prReviewQueue = new Queue(config.queueName, {
      connection: getRedisClient(),
      defaultJobOptions: jobConfig.defaultJobOptions,
    })
  }
  return _prReviewQueue
}
