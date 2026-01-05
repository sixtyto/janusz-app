import type { JobState } from 'bullmq'
import { JobStatus } from '#shared/types/JobStatus'
import { getPaginatedJobIdsForInstallations } from './jobIndex'

export interface JobFilter {
  type?: JobStatus[]
  start?: number
  end?: number
  installationIds?: Set<number>
}

export interface JobsResult {
  jobs: Array<{
    state: JobState | 'unknown'
    [key: string]: unknown
  }>
  total: number
}

export const jobService = {
  async getJob(jobId: string) {
    return getPrReviewQueue().getJob(jobId)
  },

  async getJobs(filter: JobFilter = {}): Promise<JobsResult> {
    const { type = [JobStatus.ACTIVE, JobStatus.WAITING, JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.DELAYED], start = 0, end = 10, installationIds } = filter
    const queue = getPrReviewQueue()

    if (installationIds && installationIds.size > 0) {
      const { jobIds, total } = await getPaginatedJobIdsForInstallations(installationIds, start, end)

      const jobsWithState = await Promise.all(
        jobIds.map(async (jobId) => {
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

      return {
        jobs: validJobs.map(({ job, state }) => ({
          ...job.toJSON(),
          state,
        })),
        total,
      }
    }

    return {
      jobs: [],
      total: 0,
    }
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
