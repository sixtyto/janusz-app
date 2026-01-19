export const RedisKeys = {
  JOB_EVENTS: (jobId: string | number) => `janusz:events:${jobId}`,
  REPO_INDEX: (repoFullName: string, jobId: string) => `janusz:index:${repoFullName}:${jobId}`,
  WEBHOOK_DELIVERY: (deliveryId: string) => `webhook:delivery:${deliveryId}`,
} as const
