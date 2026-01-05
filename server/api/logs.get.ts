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

  const logsPromises = [...installationIds].map(async id =>
    redis.lrange(`janusz:logs:installation:${id}`, 0, 999),
  )

  const logsArrays = await Promise.all(logsPromises)

  const allLogs = logsArrays.flat()
    .map((logStr) => {
      try {
        return JSON.parse(logStr) as LogEntry
      } catch {
        return null
      }
    })
    .filter((log): log is LogEntry => log !== null)

  const filteredLogs = allLogs

  filteredLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  return filteredLogs
})
