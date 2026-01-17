import { getUserInstallationIds } from '~~/server/utils/getUserInstallationIds'
import { useRateLimiter } from '~~/server/utils/rateLimiter'

export default defineEventHandler(async (event) => {
  await useRateLimiter(event)

  const session = await requireUserSession(event)

  const githubToken = session.secure?.githubToken
  if (!githubToken) {
    throw createError({ status: 401, message: 'Missing GitHub token' })
  }

  const installationIds = await getUserInstallationIds(githubToken)

  return await jobService.getJobStats(installationIds)
})
