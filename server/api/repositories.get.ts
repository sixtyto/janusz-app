import { Octokit } from 'octokit'
import { useRateLimiter } from '~~/server/utils/rateLimiter'

const getUserRepositories = defineCachedFunction(async (userId: number, token: string, januszAppId?: string) => {
  const octokit = new Octokit({ auth: token })

  const { data: installationsData } = await octokit.rest.apps.listInstallationsForAuthenticatedUser()

  const targetInstallations = januszAppId
    ? installationsData.installations.filter(i => i.app_id === Number.parseInt(januszAppId))
    : installationsData.installations

  const repoPromises = targetInstallations.map(async (installation) => {
    const { data } = await octokit.rest.apps.listInstallationReposForAuthenticatedUser({
      installation_id: installation.id,
    })
    return data.repositories
  })

  const nestedRepos = await Promise.all(repoPromises)
  return nestedRepos.flat()
}, {
  maxAge: 60 * 5,
  name: 'user-repositories',
  getKey: (userId: number) => String(userId),
})

export default defineEventHandler(async (event) => {
  await useRateLimiter(event, { maxRequests: 20 })

  const session = await requireUserSession(event)
  const token = session.secure?.githubToken
  const config = useRuntimeConfig()

  if (!token) {
    throw createError({
      status: 401,
      message: 'Missing GitHub token',
    })
  }

  const userId = session.user.id as number

  return await getUserRepositories(userId, token, config.githubAppId)
})
