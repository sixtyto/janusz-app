import { createHash } from 'node:crypto'
import { Octokit } from 'octokit'

interface CacheEntry {
  installationIds: Set<number>
  expiresAt: number
}

const INSTALLATION_CACHE_TTL_MS = 60 * 1000
const INSTALLATION_CACHE_MAX_SIZE = 1000
const installationCache = new Map<string, CacheEntry>()

function getTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function getUserInstallationIds(githubToken: string): Promise<Set<number>> {
  const cacheKey = getTokenHash(githubToken)
  const cached = installationCache.get(cacheKey)

  if (cached && cached.expiresAt > Date.now()) {
    installationCache.delete(cacheKey)
    installationCache.set(cacheKey, cached)
    return cached.installationIds
  }

  const config = useRuntimeConfig()
  const octokit = new Octokit({ auth: githubToken })

  const allInstallations = await octokit.paginate(octokit.rest.apps.listInstallationsForAuthenticatedUser)
  const januszAppId = config.githubAppId
  const installations = januszAppId
    ? allInstallations.filter(installation => installation.app_id === Number.parseInt(januszAppId))
    : allInstallations

  const installationIds = new Set(installations.map(installation => installation.id))

  while (installationCache.size >= INSTALLATION_CACHE_MAX_SIZE) {
    const oldestKey = installationCache.keys().next().value
    if (oldestKey) {
      installationCache.delete(oldestKey)
    }
  }

  installationCache.set(cacheKey, {
    installationIds,
    expiresAt: Date.now() + INSTALLATION_CACHE_TTL_MS,
  })

  return installationIds
}
