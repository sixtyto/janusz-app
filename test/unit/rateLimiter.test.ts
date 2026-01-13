import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Redis } from 'ioredis'
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
    eval: vi.fn(),
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
    vi.mocked(mockRedis.eval).mockResolvedValue([1, 2, Date.now()])

    const result = await checkRateLimit(mockRedis, 'user123', config)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(2)
    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'test:limit:user123',
      expect.any(String),
      expect.any(String),
      '5',
      '60',
      expect.any(String),
    )
  })

  it('should block requests when limit exceeded', async () => {
    const oldestTimestamp = Date.now() - 30000
    vi.mocked(mockRedis.eval).mockResolvedValue([0, 0, oldestTimestamp])

    const result = await checkRateLimit(mockRedis, 'user123', config)

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.resetAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('should execute Lua script atomically', async () => {
    vi.mocked(mockRedis.eval).mockResolvedValue([1, 4, Date.now()])

    await checkRateLimit(mockRedis, 'user456', config)

    expect(mockRedis.eval).toHaveBeenCalledTimes(1)
    const [script, numKeys, key] = vi.mocked(mockRedis.eval).mock.calls[0]
    expect(script).toContain('ZREMRANGEBYSCORE')
    expect(script).toContain('ZCARD')
    expect(script).toContain('ZADD')
    expect(script).toContain('EXPIRE')
    expect(numKeys).toBe(1)
    expect(key).toBe('test:limit:user456')
  })

  it('should calculate correct remaining count', async () => {
    vi.mocked(mockRedis.eval).mockResolvedValue([1, 1, Date.now()])

    const result = await checkRateLimit(mockRedis, 'user789', config)

    expect(result.remaining).toBe(1)
  })

  it('should handle zero requests correctly', async () => {
    vi.mocked(mockRedis.eval).mockResolvedValue([1, 4, Date.now()])

    const result = await checkRateLimit(mockRedis, 'new-user', config)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('should include all required parameters in Lua script call', async () => {
    const now = Date.now()
    vi.mocked(mockRedis.eval).mockResolvedValue([1, 3, now])

    await checkRateLimit(mockRedis, 'user999', config)

    const args = vi.mocked(mockRedis.eval).mock.calls[0]
    expect(args).toHaveLength(8)
    expect(args[2]).toBe('test:limit:user999')
    expect(args[4]).toMatch(/^\d+$/)
    expect(args[5]).toBe('5')
    expect(args[6]).toBe('60')
  })

  it('should pass unique member identifier to prevent collisions', async () => {
    vi.mocked(mockRedis.eval).mockResolvedValue([1, 4, Date.now()])

    await checkRateLimit(mockRedis, 'userABC', config)

    const memberArg = vi.mocked(mockRedis.eval).mock.calls[0][7] as string
    expect(memberArg).toMatch(/^\d+:\d+\.\d+$/)
  })

  it('should fail open when Redis throws error', async () => {
    vi.mocked(mockRedis.eval).mockRejectedValue(new Error('Redis connection lost'))

    const result = await checkRateLimit(mockRedis, 'error-user', config)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(config.maxRequests)
  })

  it('should calculate resetAt correctly when blocked', async () => {
    const oldestTimestamp = 1700000000000
    vi.mocked(mockRedis.eval).mockResolvedValue([0, 0, oldestTimestamp])

    const result = await checkRateLimit(mockRedis, 'blocked-user', config)

    const expectedResetAt = new Date(oldestTimestamp + (config.windowSeconds * 1000))
    expect(result.resetAt.getTime()).toBe(expectedResetAt.getTime())
  })

  it('should handle empty result gracefully', async () => {
    const now = Date.now()
    vi.mocked(mockRedis.eval).mockResolvedValue([0, 0, now])

    const result = await checkRateLimit(mockRedis, 'edge-case', config)

    expect(result.allowed).toBe(false)
    expect(result.resetAt.getTime()).toBeGreaterThanOrEqual(now)
  })

  it('should use correct Redis key with prefix and identifier', async () => {
    vi.mocked(mockRedis.eval).mockResolvedValue([1, 4, Date.now()])

    await checkRateLimit(mockRedis, 'specific-id', config)

    const keyArg = vi.mocked(mockRedis.eval).mock.calls[0][2]
    expect(keyArg).toBe('test:limit:specific-id')
  })

  it('should return correct resetAt when allowed', async () => {
    const now = Date.now()
    vi.mocked(mockRedis.eval).mockResolvedValue([1, 3, now])

    const result = await checkRateLimit(mockRedis, 'user-allowed', config)

    expect(result.allowed).toBe(true)
    expect(result.resetAt.getTime()).toBeGreaterThan(now)
    expect(result.resetAt.getTime()).toBeLessThanOrEqual(now + (config.windowSeconds * 1000) + 10)
  })
})
