import type { Redis } from 'ioredis'
import { ServiceType } from '#shared/types/ServiceType'
import { useLogger } from './useLogger'

export interface RateLimitConfig {
  maxRequests: number
  windowSeconds: number
  keyPrefix: string
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
}

export async function checkRateLimit(
  redis: Redis,
  identifier: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const logger = useLogger(ServiceType.webhook)
  const now = Date.now()
  const windowStart = now - (config.windowSeconds * 1000)
  const key = `${config.keyPrefix}:${identifier}`

  try {
    await redis.zremrangebyscore(key, 0, windowStart)
    const requestCount = await redis.zcard(key)

    if (requestCount >= config.maxRequests) {
      const oldestRequests = await redis.zrange(key, 0, 0, 'WITHSCORES')
      const oldestTimestampStr = oldestRequests[1]
      const oldestTimestamp = oldestTimestampStr ? Number.parseInt(oldestTimestampStr) : now
      const resetAt = new Date(oldestTimestamp + (config.windowSeconds * 1000))

      return {
        allowed: false,
        remaining: 0,
        resetAt,
      }
    }

    await redis.zadd(key, now, `${now}:${Math.random()}`)
    await redis.expire(key, config.windowSeconds * 2)

    return {
      allowed: true,
      remaining: config.maxRequests - requestCount - 1,
      resetAt: new Date(now + (config.windowSeconds * 1000)),
    }
  } catch (error) {
    logger.error('Rate limiter Redis error', { error, identifier })
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: new Date(now + (config.windowSeconds * 1000)),
    }
  }
}
