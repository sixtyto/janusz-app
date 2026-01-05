const INDEX_KEY_PREFIX = 'janusz:jobs:installation:'

function getIndexKey(installationId: number): string {
  return `${INDEX_KEY_PREFIX}${installationId}`
}

export async function addJobToInstallationIndex(installationId: number, jobId: string, timestamp?: number): Promise<void> {
  const redis = getRedisClient()
  const score = timestamp ?? Date.now()
  await redis.zadd(getIndexKey(installationId), score, jobId)
}

export async function removeJobFromInstallationIndex(installationId: number, jobId: string): Promise<void> {
  const redis = getRedisClient()
  await redis.zrem(getIndexKey(installationId), jobId)
}

export async function getJobIdsForInstallations(installationIds: Set<number>): Promise<Set<string>> {
  if (installationIds.size === 0) {
    return new Set()
  }

  const redis = getRedisClient()
  const keys = [...installationIds].map(id => getIndexKey(id))

  if (keys.length === 1) {
    const members = await redis.zrange(keys[0], 0, -1)
    return new Set(members)
  }

  const tempKey = `janusz:temp:union:${Date.now()}`
  await redis.zunionstore(tempKey, keys.length, ...keys)
  const members = await redis.zrange(tempKey, 0, -1)
  await redis.del(tempKey)
  return new Set(members)
}

export interface PaginatedJobIds {
  jobIds: string[]
  total: number
}

export async function getPaginatedJobIdsForInstallations(
  installationIds: Set<number>,
  start: number,
  end: number,
): Promise<PaginatedJobIds> {
  if (installationIds.size === 0) {
    return { jobIds: [], total: 0 }
  }

  const redis = getRedisClient()
  const keys = [...installationIds].map(id => getIndexKey(id))

  if (keys.length === 1) {
    const total = await redis.zcard(keys[0])
    const jobIds = await redis.zrevrange(keys[0], start, end)
    return { jobIds, total }
  }

  const tempKey = `janusz:temp:union:${Date.now()}`
  await redis.zunionstore(tempKey, keys.length, ...keys)
  const total = await redis.zcard(tempKey)
  const jobIds = await redis.zrevrange(tempKey, start, end)
  await redis.del(tempKey)

  return { jobIds, total }
}
