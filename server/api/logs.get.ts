import type { LogEntry } from '#shared/types/LogEntry'
import { MAX_INSTALLATION_LOGS } from '~~/server/utils/createLogger'
import { getUserInstallationIds } from '~~/server/utils/getUserInstallationIds'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const githubToken = session.secure?.githubToken
  if (!githubToken) {
    throw createError({ status: 401, message: 'Missing GitHub token' })
  }

  const installationIds = await getUserInstallationIds(githubToken)

  const redis = getRedisClient()
  const pipeline = redis.pipeline()

  for (const id of installationIds) {
    pipeline.lrange(`janusz:logs:installation:${id}`, 0, MAX_INSTALLATION_LOGS)
  }

  const results = await pipeline.exec()

  if (!results) {
    return []
  }

  const rawLogs: string[] = []

  for (const [err, logs] of results) {
    if (!err && logs && Array.isArray(logs)) {
      for (const log of logs) {
        rawLogs.push(log as string)
      }
    }
  }

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

  allLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  return allLogs
})
