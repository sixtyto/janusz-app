import type { Job } from 'bullmq'
import { JobStatus } from '#shared/types/JobStatus'

export interface JobFilter {
  type?: JobStatus[]
  start?: number
  end?: number
  installationId?: number
}

export const jobService = {
  async getJob(jobId: string) {
    const job = await getPrReviewQueue().getJob(jobId)
    return job as Job<PrReviewJobData> | undefined
  },

  async getJobs(filter: JobFilter = {}) {
    const { type = [JobStatus.ACTIVE, JobStatus.WAITING, JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.DELAYED], start = 0, end = 10, installationId } = filter

    const jobs = await getPrReviewQueue().getJobs(type as any, start, end, false) as Job<PrReviewJobData>[]

    if (installationId) {
      return jobs.filter(job => job.data?.installationId === installationId)
    }

    return jobs
  },

  async retryJob(jobId: string) {
    const job = await getPrReviewQueue().getJob(jobId)
    if (!job) {
      throw new Error('Job not found')
    }

    const state = await job.getState()
    if (state !== JobStatus.FAILED) {
      throw new Error(`Cannot retry job in ${state} state`)
    }

    await job.retry()
    return job
  },

  async deleteJob(jobId: string) {
    const job = await getPrReviewQueue().getJob(jobId)
    if (!job) {
      throw new Error('Job not found')
    }

    const state = await job.getState()
    if (state === JobStatus.ACTIVE) {
      throw new Error('Cannot delete active job')
    }

    await job.remove()
    return true
  },

  async getJobCounts() {
    return getPrReviewQueue().getJobCounts()
  },
}
