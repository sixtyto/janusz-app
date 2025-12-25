import type { ServiceType } from '#shared/types/ServiceType'
import { LogLevel } from '#shared/types/LogLevel'

export function createLogger(service: ServiceType) {
  const redis = getRedisClient()

  function push(level: LogLevel, message: string, meta?: Record<string, any>) {
    if (redis.status !== 'ready' && redis.status !== 'connect' && redis.status !== 'connecting')
      return

    const safeMeta = { ...meta }
    if (safeMeta.error && safeMeta.error instanceof Error) {
      safeMeta.error = {
        message: safeMeta.error.message,
        stack: safeMeta.error.stack,
        name: safeMeta.error.name,
        cause: safeMeta.error.cause,
      }
    }

    const entry = {
      timestamp: new Date().toISOString(),
      service,
      level,
      message,
      meta: safeMeta,
    }

    const payload = JSON.stringify(entry)

    if (safeMeta.jobId) {
      redis.publish(`janusz:events:${safeMeta.jobId}`, payload).catch(() => {})
    }

    redis
      .lpush(`janusz:logs:${service}`, payload)
      .then(() => redis.ltrim(`janusz:logs:${service}`, 0, 999))
      .catch(() => { })
  }

  return {
    info: (msg: string, meta?: Record<string, any>) => {
      // eslint-disable-next-line no-console
      console.log(`[INFO] ${msg}`, meta ?? '')
      push(LogLevel.info, msg, meta)
    },
    warn: (msg: string, meta?: Record<string, any>) => {
      console.warn(`[WARN] ${msg}`, meta ?? '')
      push(LogLevel.warning, msg, meta)
    },
    error: (msg: string, meta?: Record<string, any>) => {
      console.error(`[ERROR] ${msg}`, meta ?? '')
      push(LogLevel.error, msg, meta)
    },
  }
}
