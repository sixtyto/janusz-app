import { AsyncLocalStorage } from 'node:async_hooks'

interface JobContext {
  jobId: string
  installationId: number
}

export const jobContextStorage = new AsyncLocalStorage<JobContext>()

export function getJobContext(): JobContext | undefined {
  return jobContextStorage.getStore()
}
