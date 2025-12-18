import { Queue } from 'bullmq'
import { config } from './config'

export const prReviewQueue = new Queue('pr-review', {
  connection: {
    url: config.REDIS_URL,
  },
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
  },
})

export async function closeQueue() {
  await prReviewQueue.close()
}
