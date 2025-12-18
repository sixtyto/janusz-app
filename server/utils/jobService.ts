import type { Job } from 'bullmq'
import { prReviewQueue } from '~~/server/utils/queue'

export type JobStatus = 'active' | 'waiting' | 'completed' | 'failed' | 'delayed' | 'paused'

export interface JobFilter {
  type?: JobStatus[]
  start?: number
  end?: number
  installationId?: number
}

export const jobService = {
  async getJob(jobId: string) {
    const job = await prReviewQueue.getJob(jobId)
    return job as Job<PrReviewJobData> | undefined
  },

  async getJobs(filter: JobFilter = {}) {
    const { type = ['active', 'waiting', 'completed', 'failed', 'delayed'], start = 0, end = 10, installationId } = filter

    const jobs = await prReviewQueue.getJobs(type, start, end, true) as Job<PrReviewJobData>[]

    if (installationId) {
      return jobs.filter(job => job.data?.installationId === installationId)
    }

    return jobs
  },

  async retryJob(jobId: string) {
    const job = await prReviewQueue.getJob(jobId)
    if (!job)
      throw new Error('Job not found')

    const state = await job.getState()
    if (state !== 'failed') {
      throw new Error(`Cannot retry job in ${state} state`)
    }

    await job.retry()
    return job
  },

  async deleteJob(jobId: string) {
    const job = await prReviewQueue.getJob(jobId)
    if (!job)
      throw new Error('Job not found')

    const state = await job.getState()
    if (state === 'active') {
      throw new Error('Cannot delete active job')
    }

    await job.remove()
    return true
  },

  async getJobCounts() {
    return prReviewQueue.getJobCounts()
  },
}
