const INDEX_KEY_PREFIX = 'janusz:jobs:installation:'

function getIndexKey(installationId: number): string {
  return `${INDEX_KEY_PREFIX}${installationId}`
}

export async function addJobToInstallationIndex(installationId: number, jobId: string): Promise<void> {
  const redis = getRedisClient()
  await redis.sadd(getIndexKey(installationId), jobId)
}

export async function removeJobFromInstallationIndex(installationId: number, jobId: string): Promise<void> {
  const redis = getRedisClient()
  await redis.srem(getIndexKey(installationId), jobId)
}

export async function getJobIdsForInstallations(installationIds: Set<number>): Promise<Set<string>> {
  if (installationIds.size === 0) {
    return new Set()
  }

  const redis = getRedisClient()
  const keys = [...installationIds].map(id => getIndexKey(id))

  if (keys.length === 1) {
    const members = await redis.smembers(keys[0])
    return new Set(members)
  }

  const members = await redis.sunion(...keys)
  return new Set(members)
}
