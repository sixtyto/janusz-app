import type { LogLevel } from '#shared/types/LogLevel'
import type { ServiceType } from '#shared/types/ServiceType'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  service: ServiceType
  message: string
  meta?: Record<string, any>
}

export default defineEventHandler(async () => {
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
      }
      catch {
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

  allLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  return allLogs
})
