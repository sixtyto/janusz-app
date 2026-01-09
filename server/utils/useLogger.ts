import type { ServiceType } from '#shared/types/ServiceType'
import type { logLevelEnum, serviceTypeEnum } from '../database/schema'
import { LogLevel } from '#shared/types/LogLevel'
import { logs } from '../database/schema'
import { getRedisClient } from './getRedisClient'
import { useDatabase } from './useDatabase'

type DatabaseLogLevel = (typeof logLevelEnum.enumValues)[number]
type DatabaseServiceType = (typeof serviceTypeEnum.enumValues)[number]

interface LogMeta extends Record<string, unknown> {
  installationId: number
  jobId?: string
}

export function useLogger(service: ServiceType) {
  function push(level: LogLevel, message: string, meta?: LogMeta) {
    const safeMeta = { ...meta }
    if (safeMeta.error && safeMeta.error instanceof Error) {
      safeMeta.error = {
        message: safeMeta.error.message,
        stack: safeMeta.error.stack,
        name: safeMeta.error.name,
        cause: safeMeta.error.cause,
      }
    }

    const installationId = safeMeta.installationId
    const jobId = safeMeta.jobId

    if (jobId) {
      const redis = getRedisClient()
      if (redis.status === 'ready' || redis.status === 'connect' || redis.status === 'connecting') {
        const payload = JSON.stringify({
          timestamp: new Date().toISOString(),
          service,
          level,
          message,
          meta: safeMeta,
        })
        redis.publish(`janusz:events:${jobId}`, payload).catch(() => {})
      }
    }

    const database = useDatabase()
    database.insert(logs).values({
      installationId: installationId ?? 0,
      jobId: jobId ?? null,
      service: service as DatabaseServiceType,
      level: level as DatabaseLogLevel,
      message,
      meta: safeMeta,
    }).catch(() => {
    })
  }

  return {
    info: (message: string, meta: LogMeta) => {
      // eslint-disable-next-line no-console
      console.log(`[INFO] ${message}`, meta)
      push(LogLevel.info, message, meta)
    },
    warn: (message: string, meta: LogMeta) => {
      console.warn(`[WARN] ${message}`, meta)
      push(LogLevel.warning, message, meta)
    },
    error: (message: string, meta: LogMeta) => {
      console.error(`[ERROR] ${message}`, meta)
      push(LogLevel.error, message, meta)
    },
  }
}
