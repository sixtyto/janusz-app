import { createHash } from 'node:crypto'
import { Octokit } from 'octokit'

interface CacheEntry {
  installationIds: Set<number>
  expiresAt: number
}

const CACHE_TTL_MS = 60 * 1000 // 60 seconds
const installationCache = new Map<string, CacheEntry>()

function getTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 16)
}

export async function getUserInstallationIds(githubToken: string): Promise<Set<number>> {
  const cacheKey = getTokenHash(githubToken)
  const cached = installationCache.get(cacheKey)

  if (cached && cached.expiresAt > Date.now()) {
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

  installationCache.set(cacheKey, {
    installationIds,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })

  return installationIds
}
