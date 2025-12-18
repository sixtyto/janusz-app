import Redis from 'ioredis'
import { config } from './config'

type LogLevel = 'info' | 'warn' | 'error'

export function createLogger(service: string) {
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  })

  function push(level: LogLevel, message: string, meta?: Record<string, any>) {
    if (redis.status !== 'ready')
      return

    const entry = {
      timestamp: new Date().toISOString(),
      service,
      level,
      message,
      meta: meta || {},
    }

    redis
      .lpush(`janusz:logs:${service}`, JSON.stringify(entry))
      .then(() => redis.ltrim(`janusz:logs:${service}`, 0, 999))
      .catch(() => {})
  }

  return {
    info: (msg: string, meta?: Record<string, any>) => {
      // eslint-disable-next-line no-console
      console.log(`[INFO] ${msg}`, meta ?? '')
      push('info', msg, meta)
    },
    warn: (msg: string, meta?: Record<string, any>) => {
      console.warn(`[WARN] ${msg}`, meta ?? '')
      push('warn', msg, meta)
    },
    error: (msg: string, meta?: Record<string, any>) => {
      console.error(`[ERROR] ${msg}`, meta ?? '')
      push('error', msg, meta)
    },
  }
}
