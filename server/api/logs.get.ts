import type { LogEntry } from '#shared/types/LogEntry'
import { desc, inArray } from 'drizzle-orm'
import { getUserInstallationIds } from '~~/server/utils/getUserInstallationIds'
import { logs } from '../database/schema'
import { useDatabase } from '../utils/useDatabase'

const DEFAULT_LIMIT = 100

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const githubToken = session.secure?.githubToken
  if (!githubToken) {
    throw createError({ status: 401, message: 'Missing GitHub token' })
  }

  const query = getQuery(event)
  const limit = Math.max(0, Math.min(Number(query.limit) || DEFAULT_LIMIT, 1000))
  const offset = Math.max(0, Number(query.offset) || 0)

  const installationIds = await getUserInstallationIds(githubToken)

  if (installationIds.size === 0) {
    return []
  }

  const database = useDatabase()
  const result = await database
    .select()
    .from(logs)
    .where(inArray(logs.installationId, Array.from(installationIds)))
    .orderBy(desc(logs.createdAt))
    .limit(limit)
    .offset(offset)

  return result.map((row): LogEntry => ({
    timestamp: row.createdAt.toISOString(),
    level: row.level as LogEntry['level'],
    service: row.service as LogEntry['service'],
    message: row.message,
    meta: row.meta as LogEntry['meta'],
  }))
})
