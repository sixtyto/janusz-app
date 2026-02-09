import type { ServiceType } from '#shared/types/ServiceType'
import type { logLevelEnum, serviceTypeEnum } from '../database/schema'
import { RedisKeys } from '#shared/constants/redisKeys'
import { LogLevel } from '#shared/types/LogLevel'
import { logs } from '../database/schema'
import { getRedisClient } from './getRedisClient'
import { getJobContext } from './jobContext'
import { sanitizeLogMeta } from './sanitizeLogMeta'
import { useDatabase } from './useDatabase'

type DatabaseLogLevel = (typeof logLevelEnum.enumValues)[number]
type DatabaseServiceType = (typeof serviceTypeEnum.enumValues)[number]

const loggerErrorState = {
  redis: { lastErrorMs: 0, failures: 0 },
  database: { lastErrorMs: 0, failures: 0 },
}

const RATE_LIMIT_MS = 5000
const COUNTER_RESET_MS = 60000

function shouldLogError(type: 'redis' | 'database'): { shouldLog: boolean, failureCount: number } {
  const now = Date.now()
  const state = loggerErrorState[type]

  const timeSinceLastError = now - state.lastErrorMs
  const shouldReset = timeSinceLastError > COUNTER_RESET_MS

  if (shouldReset) {
    state.failures = 1
    state.lastErrorMs = now
    return { shouldLog: true, failureCount: 1 }
  }

  state.failures++

  if (timeSinceLastError < RATE_LIMIT_MS) {
    return { shouldLog: false, failureCount: state.failures }
  }

  state.lastErrorMs = now
  return { shouldLog: true, failureCount: state.failures }
}

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
          meta: sanitizeLogMeta(safeMeta),
        })
        redis.publish(RedisKeys.JOB_EVENTS(String(jobId)), payload).catch((error) => {
          const { shouldLog, failureCount } = shouldLogError('redis')
          if (shouldLog) {
            console.error('[LOGGER] Redis publish failed - live streaming unavailable', {
              error,
              service,
              failureCount,
            })
          }
        })
      }
    }

    const database = useDatabase()
    database.insert(logs).values({
      installationId,
      jobId: jobId ? String(jobId) : null,
      service: service as DatabaseServiceType,
      level: level as DatabaseLogLevel,
      message,
      meta: safeMeta,
    }).catch((error) => {
      const { shouldLog, failureCount } = shouldLogError('database')
      if (shouldLog) {
        console.error('[LOGGER] Database insert failed - logs being dropped', {
          error,
          service,
          level,
          failureCount,
        })
      }
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
