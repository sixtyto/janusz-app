import type { LogEntry, PaginatedLogsResponse } from '#shared/types/LogEntry'
import { LogLevel } from '#shared/types/LogLevel'
import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { getUserInstallationIds } from '~~/server/utils/getUserInstallationIds'
import { useRateLimiter } from '~~/server/utils/rateLimiter'
import { logs, serviceTypeEnum } from '../database/schema'
import { useDatabase } from '../utils/useDatabase'

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  service: z.enum(serviceTypeEnum.enumValues).optional(),
  level: z.nativeEnum(LogLevel).optional(),
})

export default defineEventHandler(async (event): Promise<PaginatedLogsResponse> => {
  await useRateLimiter(event, { maxRequests: 60 })

  const session = await requireUserSession(event)

  const githubToken = session.secure?.githubToken
  if (!githubToken) {
    throw createError({ status: 401, message: 'Missing GitHub token' })
  }

  const query = await getValidatedQuery(event, queryParams => querySchema.parse(queryParams))
  const page = query.page
  const limit = query.limit
  const offset = (page - 1) * limit

  const installationIds = await getUserInstallationIds(githubToken)

  if (installationIds.size === 0) {
    return { logs: [], total: 0, page, limit }
  }

  const database = useDatabase()
  const conditions = [inArray(logs.installationId, Array.from(installationIds))]

  if (query.service) {
    conditions.push(eq(logs.service, query.service))
  }

  if (query.level) {
    conditions.push(eq(logs.level, query.level))
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions)

  const [countResult, logRecords] = await Promise.all([
    database.select({ count: count() }).from(logs).where(whereClause),
    database.select().from(logs).where(whereClause).orderBy(desc(logs.createdAt)).limit(limit).offset(offset),
  ])

  const total = countResult[0]?.count ?? 0

  const logsData: LogEntry[] = logRecords.map((row): LogEntry => ({
    timestamp: row.createdAt.toISOString(),
    level: row.level as LogEntry['level'],
    service: row.service as LogEntry['service'],
    message: row.message,
    meta: row.meta as LogEntry['meta'],
  }))

  return {
    logs: logsData,
    total,
    page,
    limit,
  }
})
