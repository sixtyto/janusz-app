import { Octokit } from 'octokit'

export async function getUserInstallationIds(githubToken: string): Promise<Set<number>> {
  const config = useRuntimeConfig()
  const octokit = new Octokit({ auth: githubToken })

  const { data } = await octokit.rest.apps.listInstallationsForAuthenticatedUser()

  const januszAppId = config.githubAppId
  const installations = januszAppId
    ? data.installations.filter(installation => installation.app_id === Number.parseInt(januszAppId))
    : data.installations

  return new Set(installations.map(installation => installation.id))
}
