import { Octokit } from 'octokit'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const githubToken = session.secure?.githubToken

  if (!githubToken) {
    throw createError({ status: 401, message: 'Missing GitHub token' })
  }

  try {
    const octokit = new Octokit({ auth: githubToken })
    const config = useRuntimeConfig()

    const { data: installationsData } = await octokit.rest.apps.listInstallationsForAuthenticatedUser()

    const targetInstallations = config.githubAppId
      ? installationsData.installations.filter(i => i.app_id === Number.parseInt(config.githubAppId))
      : installationsData.installations

    const repositories: Array<{
      id: number
      name: string
      full_name: string
      description: string | null
      language: string | null
      private: boolean
    }> = []

    for (const installation of targetInstallations) {
      try {
        const { data } = await octokit.rest.apps.listInstallationReposForAuthenticatedUser({
          installation_id: installation.id,
        })

        repositories.push(...data.repositories.map(repo => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          description: repo.description ?? null,
          language: repo.language ?? null,
          private: repo.private,
        })))
      } catch (error) {
        // Log but continue with other installations
        console.error(`Failed to fetch repos for installation ${installation.id}:`, error)
      }
    }

    return repositories
  } catch {
    throw createError({
      status: 502,
      message: 'Failed to communicate with GitHub API',
    })
  }
})
