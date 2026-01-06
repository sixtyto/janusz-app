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

  // Fetch logs from all accessible installations
  const logsPromises = Array.from(installationIds).map(async (id) => {
    return redis.lrange(`janusz:logs:installation:${id}`, 0, 999)
  })

  const logsArrays = await Promise.all(logsPromises)
  const rawLogs = logsArrays.flat()

  const parseLogs = (logs: string[]) => logs
    .map((logStr) => {
      try {
        return JSON.parse(logStr) as LogEntry
      } catch {
        return null
      }
    })
    .filter((log): log is LogEntry => log !== null)

  const allLogs = parseLogs(rawLogs)

  // Sort by timestamp descending
  allLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  return allLogs
})
