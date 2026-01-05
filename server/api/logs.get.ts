import type { LogEntry } from '#shared/types/LogEntry'
import { getUserInstallationIds } from '~~/server/utils/getUserInstallationIds'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const githubToken = session.secure?.githubToken
  if (!githubToken) {
    throw createError({ status: 401, message: 'Missing GitHub token' })
  }

  const installationIds = await getUserInstallationIds(githubToken)
  const redis = getRedisClient()

  const [workerLogs, webhookLogs, indexerLogs, contextLogs] = await Promise.all([
    redis.lrange('janusz:logs:worker', 0, 999),
    redis.lrange('janusz:logs:webhook', 0, 999),
    redis.lrange('janusz:logs:repo-indexer', 0, 999),
    redis.lrange('janusz:logs:context-selector', 0, 999),
  ])

  const parseLogs = (logs: string[]) => logs
    .map((logStr) => {
      try {
        return JSON.parse(logStr) as LogEntry
      } catch {
        return null
      }
    })
    .filter((log): log is LogEntry => log !== null)

  const allLogs = [
    ...parseLogs(workerLogs),
    ...parseLogs(webhookLogs),
    ...parseLogs(indexerLogs),
    ...parseLogs(contextLogs),
  ]

  const filteredLogs = allLogs.filter((log) => {
    return log.meta !== undefined && installationIds.has(log.meta.installationId)
  })

  filteredLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  return filteredLogs
})
