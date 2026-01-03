import type { DefaultJobOptions } from 'bullmq'
import { Queue } from 'bullmq'

const jobConfig = {
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: false,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 30_000,
    },
  } satisfies DefaultJobOptions,
} as const

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
