import type { DefaultJobOptions } from 'bullmq'

export const jobConfig = {
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
