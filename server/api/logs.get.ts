export interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  service: 'worker' | 'webhook'
  message: string
  jobId?: string
}

export default defineEventHandler(async () => {
  const redis = getRedisClient()

  const [workerLogs, webhookLogs] = await Promise.all([
    redis.lrange('janusz:logs:worker', 0, 999),
    redis.lrange('janusz:logs:webhook-reciever', 0, 999),
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
  ]

  allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return allLogs
})
