import { Queue } from 'bullmq'

export const prReviewQueue = new Queue('pr-review', {
  connection: getRedisClient(),
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
  },
})
