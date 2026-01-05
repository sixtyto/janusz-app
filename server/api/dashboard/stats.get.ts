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

  const allJobs = await queue.getJobs(
    [JobStatus.ACTIVE, JobStatus.WAITING, JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.DELAYED],
    0,
    1000,
  )

  const userJobs = allJobs.filter((job) => {
    const data = job.data as PrReviewJobData | undefined
    return data?.installationId !== undefined && installationIds.has(data.installationId)
  })

  const stats = {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
  }

  await Promise.all(
    userJobs.map(async (job) => {
      const state = await job.getState()
      if (state in stats) {
        stats[state as keyof typeof stats]++
      }
    }),
  )

  return stats
})
