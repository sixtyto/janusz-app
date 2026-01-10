import type { DefaultJobOptions, RedisClient } from 'bullmq'
import { Queue } from 'bullmq'

const defaultJobOptions: DefaultJobOptions = {
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
}

let _prReviewQueue: Queue | undefined

export function getPrReviewQueue() {
  if (!_prReviewQueue) {
    const config = useRuntimeConfig()
    _prReviewQueue = new Queue(config.queueName, {
      connection: getRedisClient() as unknown as RedisClient,
      defaultJobOptions,
    })
  }
  return _prReviewQueue
}
