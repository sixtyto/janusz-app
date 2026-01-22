import type { H3Event } from 'h3'
import type { Redis } from 'ioredis'
import { ServiceType } from '#shared/types/ServiceType'
import { getRedisClient } from './getRedisClient'
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

const RATE_LIMIT_LUA_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_start = tonumber(ARGV[2])
local max_requests = tonumber(ARGV[3])
local window_seconds = tonumber(ARGV[4])
local member = ARGV[5]

redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
local count = redis.call('ZCARD', key)

if count >= max_requests then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldest_timestamp = oldest[2] or now
  return {0, 0, oldest_timestamp}
end

redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, window_seconds * 2)

return {1, max_requests - count - 1, now}
`

export async function checkRateLimit(
  redis: Redis,
  identifier: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const logger = useLogger(ServiceType.api)
  const now = Date.now()
  const windowStart = now - (config.windowSeconds * 1000)
  const key = `${config.keyPrefix}:${identifier}`
  const member = `${now}:${Math.random()}`

  try {
    const result = await redis.eval(
      RATE_LIMIT_LUA_SCRIPT,
      1,
      key,
      now.toString(),
      windowStart.toString(),
      config.maxRequests.toString(),
      config.windowSeconds.toString(),
      member,
    ) as [number, number, number]

    const [allowed, remaining, timestamp] = result
    const resetAt = new Date(
      allowed
        ? now + (config.windowSeconds * 1000)
        : timestamp + (config.windowSeconds * 1000),
    )

    return {
      allowed: allowed === 1,
      remaining,
      resetAt,
    }
  } catch (error) {
    logger.error('Rate limiter Redis error', { error, identifier })
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(now + (config.windowSeconds * 1000)),
    }
  }
}

interface UseRateLimiterOptions {
  maxRequests?: number
  timeWindow?: number
  keyPrefix?: string
  useIpOnly?: boolean
}

export async function useRateLimiter(
  event: H3Event,
  options: UseRateLimiterOptions = {},
): Promise<void> {
  const { maxRequests = 60, timeWindow = 60, keyPrefix: explicitKeyPrefix, useIpOnly = false } = options

  const { pathname } = getRequestURL(event)
  let identifier: string

  if (useIpOnly) {
    identifier = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  } else {
    const session = await getUserSession(event)
    if (session?.user?.id) {
      identifier = session.user.id.toString()
    } else {
      identifier = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
    }
  }

  const method = event.method
  const cleanPath = pathname.split('/').filter(Boolean).filter(s => s !== 'api').join(':')
  const finalKeyPrefix = explicitKeyPrefix || (cleanPath ? `api:${method}:${cleanPath}` : `api:${method}:default`)

  const config: RateLimitConfig = {
    maxRequests,
    windowSeconds: timeWindow,
    keyPrefix: finalKeyPrefix,
  }

  const redis = getRedisClient()
  const result = await checkRateLimit(redis, identifier, config)

  setHeader(event, 'X-RateLimit-Limit', config.maxRequests.toString())
  setHeader(event, 'X-RateLimit-Remaining', result.remaining.toString())
  setHeader(event, 'X-RateLimit-Reset', Math.floor(result.resetAt.getTime() / 1000).toString())

  if (!result.allowed) {
    const logger = useLogger(ServiceType.api)
    logger.warn('API rate limit exceeded', {
      identifier,
      path: event.path,
      resetAt: result.resetAt,
    })

    throw createError({
      status: 429,
      message: 'Too Many Requests',
      data: {
        resetAt: result.resetAt.toISOString(),
      },
    })
  }
}
