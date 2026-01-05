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

  const stateTypes = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const
  type StateType = typeof stateTypes[number]

  const stats: Record<StateType, number> = {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
  }

  const jobsByState = await Promise.all(
    stateTypes.map(async (state) => {
      const jobs = await queue.getJobs([state])
      return { state, jobs }
    }),
  )

  for (const { state, jobs } of jobsByState) {
    for (const job of jobs) {
      if (indexedJobIds.has(job.id ?? '')) {
        stats[state]++
      }
    }
  }

  return stats
})
