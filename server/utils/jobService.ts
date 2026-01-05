import type { JobState } from 'bullmq'
import { JobStatus } from '#shared/types/JobStatus'
import { getJobIdsForInstallations } from './jobIndex'

export interface JobFilter {
  type?: JobStatus[]
  start?: number
  end?: number
  installationIds?: Set<number>
}

export const jobService = {
  async getJob(jobId: string) {
    return getPrReviewQueue().getJob(jobId)
  },

  async getJobs(filter: JobFilter = {}) {
    const { type = [JobStatus.ACTIVE, JobStatus.WAITING, JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.DELAYED], start = 0, end = 10, installationIds } = filter
    const queue = getPrReviewQueue()

    if (installationIds && installationIds.size > 0) {
      const indexedJobIds = await getJobIdsForInstallations(installationIds)

      const jobsWithState = await Promise.all(
        Array.from(indexedJobIds).map(async (jobId) => {
          const job = await queue.getJob(jobId)
          if (!job) {
            return null
          }
          const state = await job.getState()
          return { job, state }
        }),
      )

      const validJobs = jobsWithState
        .filter((entry): entry is { job: NonNullable<typeof entry>['job'], state: JobState } =>
          entry !== null && type.includes(entry.state as JobStatus),
        )

      const paginatedJobs = validJobs.slice(start, end + 1)

      return paginatedJobs.map(({ job, state }) => ({
        ...job.toJSON(),
        state,
      }))
    }

    const jobs = await queue.getJobs(type as JobState[], start, end)
    return Promise.all(jobs.map(async (job) => {
      const state = await job.getState()
      return {
        ...job.toJSON(),
        state,
      }
    }))
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
