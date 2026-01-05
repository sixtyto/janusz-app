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
  const queue = getPrReviewQueue()

  const stateTypes = [
    JobStatus.WAITING,
    JobStatus.ACTIVE,
    JobStatus.COMPLETED,
    JobStatus.FAILED,
    JobStatus.DELAYED,
  ] as const

  const jobsByState = await Promise.all(
    stateTypes.map(async (state) => {
      const jobs = await queue.getJobs([state])
      const userJobs = jobs.filter((job) => {
        const data = job.data as PrReviewJobData | undefined
        return data?.installationId !== undefined && installationIds.has(data.installationId)
      })
      return { state, count: userJobs.length }
    }),
  )

  const stats = {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
  }

  for (const { state, count } of jobsByState) {
    if (state in stats) {
      stats[state as keyof typeof stats] = count
    }
  }

  return stats
})
