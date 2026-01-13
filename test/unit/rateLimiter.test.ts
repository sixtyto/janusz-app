import type { Redis } from 'ioredis'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkRateLimit } from '~~/server/utils/rateLimiter'

vi.mock('~~/server/utils/useLogger', () => ({
  useLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

function createMockRedis(): Redis {
  return {
    zremrangebyscore: vi.fn().mockResolvedValue(0),
    zcard: vi.fn().mockResolvedValue(0),
    zrange: vi.fn().mockResolvedValue([]),
    zadd: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
  } as unknown as Redis
}

describe('rateLimiter', () => {
  let mockRedis: Redis
  const config = {
    maxRequests: 5,
    windowSeconds: 60,
    keyPrefix: 'test:limit',
  }

  beforeEach(() => {
    mockRedis = createMockRedis()
    vi.clearAllMocks()
  })

  it('should allow requests within limit', async () => {
    vi.mocked(mockRedis.zcard).mockResolvedValue(2)

    const result = await checkRateLimit(mockRedis, 'user123', config)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(2)
    expect(mockRedis.zremrangebyscore).toHaveBeenCalledWith(
      'test:limit:user123',
      0,
      expect.any(Number),
    )
    expect(mockRedis.zadd).toHaveBeenCalledWith(
      'test:limit:user123',
      expect.any(Number),
      expect.any(String),
    )
    expect(mockRedis.expire).toHaveBeenCalledWith('test:limit:user123', 120)
  })

  it('should block requests when limit exceeded', async () => {
    const oldestTimestamp = Date.now() - 30000
    vi.mocked(mockRedis.zcard).mockResolvedValue(5)
    vi.mocked(mockRedis.zrange).mockResolvedValue([
      'oldest-entry',
      oldestTimestamp.toString(),
    ])

    const result = await checkRateLimit(mockRedis, 'user123', config)

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.resetAt.getTime()).toBeGreaterThan(Date.now())
    expect(mockRedis.zadd).not.toHaveBeenCalled()
  })

  it('should remove old entries outside time window', async () => {
    const now = Date.now()
    const windowStart = now - (config.windowSeconds * 1000)

    await checkRateLimit(mockRedis, 'user456', config)

    expect(mockRedis.zremrangebyscore).toHaveBeenCalledWith(
      'test:limit:user456',
      0,
      expect.any(Number),
    )

    const actualWindowStart = vi.mocked(mockRedis.zremrangebyscore).mock.calls[0][2] as number
    expect(actualWindowStart).toBeGreaterThanOrEqual(windowStart - 100)
    expect(actualWindowStart).toBeLessThanOrEqual(windowStart + 100)
  })

  it('should calculate correct remaining count', async () => {
    vi.mocked(mockRedis.zcard).mockResolvedValue(3)

    const result = await checkRateLimit(mockRedis, 'user789', config)

    expect(result.remaining).toBe(1)
  })

  it('should handle zero requests correctly', async () => {
    vi.mocked(mockRedis.zcard).mockResolvedValue(0)

    const result = await checkRateLimit(mockRedis, 'new-user', config)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('should set expiry for automatic cleanup', async () => {
    await checkRateLimit(mockRedis, 'user999', config)

    expect(mockRedis.expire).toHaveBeenCalledWith(
      'test:limit:user999',
      config.windowSeconds * 2,
    )
  })

  it('should add unique entries to sorted set', async () => {
    await checkRateLimit(mockRedis, 'userABC', config)

    expect(mockRedis.zadd).toHaveBeenCalledWith(
      'test:limit:userABC',
      expect.any(Number),
      expect.stringMatching(/^\d+:\d+\.\d+$/),
    )
  })

  it('should fail open when Redis throws error', async () => {
    vi.mocked(mockRedis.zremrangebyscore).mockRejectedValue(new Error('Redis connection lost'))

    const result = await checkRateLimit(mockRedis, 'error-user', config)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(config.maxRequests)
    expect(mockRedis.zadd).not.toHaveBeenCalled()
  })

  it('should calculate resetAt correctly when blocked', async () => {
    const oldestTimestamp = 1700000000000
    vi.mocked(mockRedis.zcard).mockResolvedValue(5)
    vi.mocked(mockRedis.zrange).mockResolvedValue([
      'entry',
      oldestTimestamp.toString(),
    ])

    const result = await checkRateLimit(mockRedis, 'blocked-user', config)

    const expectedResetAt = new Date(oldestTimestamp + (config.windowSeconds * 1000))
    expect(result.resetAt.getTime()).toBe(expectedResetAt.getTime())
  })

  it('should handle empty zrange result for reset time', async () => {
    const now = Date.now()
    vi.mocked(mockRedis.zcard).mockResolvedValue(5)
    vi.mocked(mockRedis.zrange).mockResolvedValue([])

    const result = await checkRateLimit(mockRedis, 'edge-case', config)

    expect(result.allowed).toBe(false)
    expect(result.resetAt.getTime()).toBeGreaterThanOrEqual(now)
  })

  it('should use correct Redis key with prefix and identifier', async () => {
    await checkRateLimit(mockRedis, 'specific-id', config)

    expect(mockRedis.zremrangebyscore).toHaveBeenCalledWith(
      'test:limit:specific-id',
      expect.any(Number),
      expect.any(Number),
    )
  })
})
