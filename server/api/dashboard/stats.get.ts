import { JobStatus } from '#shared/types/JobStatus'
import { getUserInstallationIds } from '~~/server/utils/getUserInstallationIds'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const githubToken = session.secure?.githubToken
  if (!githubToken) {
    throw createError({ status: 401, message: 'Missing GitHub token' })
  }

  const installationIds = await getUserInstallationIds(githubToken)

  const filteredJobs = await jobService.getJobs({
    type: [JobStatus.ACTIVE, JobStatus.WAITING, JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.DELAYED],
    start: 0,
    end: 2500,
    installationIds,
  })

  const waiting = filteredJobs.filter(job => job.state === JobStatus.WAITING).length
  const active = filteredJobs.filter(job => job.state === JobStatus.ACTIVE).length
  const failed = filteredJobs.filter(job => job.state === JobStatus.FAILED).length
  const delayed = filteredJobs.filter(job => job.state === JobStatus.DELAYED).length
  const completed = filteredJobs.filter(job => job.state === JobStatus.COMPLETED).length

  return {
    waiting,
    active,
    failed,
    delayed,
    completed,
  }
})
