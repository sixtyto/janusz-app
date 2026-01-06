import { getUserInstallationIds } from '~~/server/utils/getUserInstallationIds'
import { JOB_STATS_SCAN_LIMIT } from '~~/server/utils/jobService'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const githubToken = session.secure?.githubToken
  if (!githubToken) {
    throw createError({ status: 401, message: 'Missing GitHub token' })
  }

  const installationIds = await getUserInstallationIds(githubToken)

  const stats = await jobService.getJobStats(installationIds, JOB_STATS_SCAN_LIMIT)

  return stats
})
