import { Octokit } from 'octokit'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const token = session.secure?.githubToken
  const config = useRuntimeConfig()

  if (!token) {
    throw createError({
      status: 401,
      message: 'Missing GitHub token',
    })
  }

  const octokit = new Octokit({ auth: token })

  const { data: installationsData } = await octokit.rest.apps.listInstallationsForAuthenticatedUser()

  const januszAppId = config.githubAppId
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
})
