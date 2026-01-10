import type { ServiceType } from '#shared/types/ServiceType'
import type { logLevelEnum, serviceTypeEnum } from '../database/schema'
import { LogLevel } from '#shared/types/LogLevel'
import { logs } from '../database/schema'
import { getRedisClient } from './getRedisClient'
import { getJobContext } from './jobContext'
import { useDatabase } from './useDatabase'

type DatabaseLogLevel = (typeof logLevelEnum.enumValues)[number]
type DatabaseServiceType = (typeof serviceTypeEnum.enumValues)[number]

export function useLogger(service: ServiceType) {
  function push(level: LogLevel, message: string, meta?: Record<string, unknown>) {
    const context = getJobContext()
    const safeMeta = { ...meta }
    if (safeMeta.error && safeMeta.error instanceof Error) {
      safeMeta.error = {
        message: safeMeta.error.message,
        stack: safeMeta.error.stack,
        name: safeMeta.error.name,
        cause: safeMeta.error.cause,
      }
    }

    const installationId = (safeMeta.installationId ?? context?.installationId ?? null) as number | null
    const jobId = safeMeta.jobId ?? context?.jobId

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
        redis.publish(`janusz:events:${String(jobId)}`, payload).catch(() => {})
      }
    }

    const database = useDatabase()
    database.insert(logs).values({
      installationId,
      jobId: (typeof jobId === 'string' ? jobId : null),
      service: service as DatabaseServiceType,
      level: level as DatabaseLogLevel,
      message,
      meta: safeMeta,
    }).catch(() => {
    })
  }

  return {
    info: (message: string, meta?: Record<string, unknown>) => {
      // eslint-disable-next-line no-console
      console.log(`[INFO] ${message}`, meta)
      push(LogLevel.info, message, meta)
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      console.warn(`[WARN] ${message}`, meta)
      push(LogLevel.warning, message, meta)
    },
    error: (message: string, meta?: Record<string, unknown>) => {
      console.error(`[ERROR] ${message}`, meta)
      push(LogLevel.error, message, meta)
    },
  }
}
