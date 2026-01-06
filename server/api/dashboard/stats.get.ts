import type { PrReviewJobData } from '#shared/types/PrReviewJobData'
import { JobStatus } from '#shared/types/JobStatus'
import { getUserInstallationIds } from '~~/server/utils/getUserInstallationIds'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const githubToken = session.secure?.githubToken
  if (!githubToken) {
    throw createError({ status: 401, message: 'Missing GitHub token' })
  }

  const installationIds = await getUserInstallationIds(githubToken)

  const allJobs = await jobService.getJobs({
    type: [JobStatus.ACTIVE, JobStatus.WAITING, JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.DELAYED],
    start: 0,
    end: 999,
  })

  const filteredJobs = allJobs.filter((job) => {
    const jobData = job.data as PrReviewJobData | undefined
    const jobInstallationId = jobData?.installationId
    return jobInstallationId !== undefined && installationIds.has(jobInstallationId)
  })

  const waiting = filteredJobs.filter(job => job.state === JobStatus.WAITING).length
  const active = filteredJobs.filter(job => job.state === JobStatus.ACTIVE).length
  const failed = filteredJobs.filter(job => job.state === JobStatus.FAILED).length
  const delayed = filteredJobs.filter(job => job.state === JobStatus.DELAYED).length

  return {
    waiting,
    active,
    failed,
    delayed,
  }
})
