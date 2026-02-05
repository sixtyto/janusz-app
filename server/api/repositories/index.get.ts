import type { Repository } from '~~/shared/types/Repository'
import { Octokit } from 'octokit'
import { getUserInstallationIds } from '~~/server/utils/getUserInstallationIds'

const CACHE_TTL_SECONDS = 300

function buildCacheKey(userId: string | number): string {
  return `repositories:user:${userId}`
}

async function fetchRepositoriesFromInstallation(
  octokit: Octokit,
  installationId: number,
): Promise<Repository[]> {
  try {
    const { data } = await octokit.rest.apps.listInstallationReposForAuthenticatedUser({
      installation_id: installationId,
      per_page: 100,
    })

    return data.repositories.map(repository => ({
      id: repository.id,
      name: repository.name,
      fullName: repository.full_name,
      description: repository.description ?? null,
      language: repository.language ?? null,
      isPrivate: repository.private,
    }))
  } catch (error) {
    console.error(`Failed to fetch repos for installation ${installationId}:`, error)
    return []
  }
}

export default defineEventHandler(async (event): Promise<Repository[]> => {
  const session = await requireUserSession(event)
  const githubToken = session.secure?.githubToken
  const userId = session.user?.id

  if (!githubToken) {
    throw createError({ status: 401, message: 'Missing GitHub token' })
  }

  if (!userId) {
    throw createError({ status: 401, message: 'Missing user ID' })
  }

  const cacheKey = buildCacheKey(userId)
  const storage = useStorage('cache')

  const cachedRepositories = await storage.getItem<Repository[]>(cacheKey)
  if (cachedRepositories) {
    return cachedRepositories
  }

  try {
    const octokit = new Octokit({ auth: githubToken })
    const installationIds = await getUserInstallationIds(githubToken)

    const repositoriesPerInstallation = await Promise.all(
      Array.from(installationIds).map(id =>
        fetchRepositoriesFromInstallation(octokit, id),
      ),
    )

    const repositories = repositoriesPerInstallation.flat()

    await storage.setItem(cacheKey, repositories, { ttl: CACHE_TTL_SECONDS })

    return repositories
  } catch {
    throw createError({
      status: 502,
      message: 'Failed to communicate with GitHub API',
    })
  }
})
