import { getUserInstallationIds } from '~~/server/utils/getUserInstallationIds'
import { getJobIdsForInstallations } from '~~/server/utils/jobIndex'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const githubToken = session.secure?.githubToken
  if (!githubToken) {
    throw createError({ status: 401, message: 'Missing GitHub token' })
  }

  const installationIds = await getUserInstallationIds(githubToken)
  const queue = getPrReviewQueue()

  const indexedJobIds = await getJobIdsForInstallations(installationIds)

  const stats = {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
  }

  await Promise.all(
    [...indexedJobIds].map(async (jobId) => {
      const job = await queue.getJob(jobId)
      if (!job) {
        return
      }

      const state = await job.getState()
      if (state && Object.keys(stats).includes(state)) {
        stats[state as keyof typeof stats]++
      }
    }),
  )

  return stats
})
