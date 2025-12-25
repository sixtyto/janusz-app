import { describe, expect, it, vi } from 'vitest'

// Stub defineEventHandler globally
vi.stubGlobal('defineEventHandler', (handler: any) => handler)

// Mock Redis client implementation
const mockRedis = {
  lrange: vi.fn().mockImplementation((key) => {
    if (key === 'janusz:logs:worker') {
      return Promise.resolve([
        JSON.stringify({ timestamp: '2023-01-01T10:00:00Z', service: 'worker', level: 'info', message: 'Worker log 1' }),
        JSON.stringify({ timestamp: '2023-01-01T12:00:00Z', service: 'worker', level: 'info', message: 'Worker log 2' }),
      ])
    }
    if (key === 'janusz:logs:webhook') {
      return Promise.resolve([
        JSON.stringify({ timestamp: '2023-01-01T11:00:00Z', service: 'webhook', level: 'info', message: 'Webhook log' }),
      ])
    }
    if (key === 'janusz:logs:repo-indexer') {
      return Promise.resolve([])
    }
    if (key === 'janusz:logs:context-selector') {
      return Promise.resolve([])
    }
    return Promise.resolve([])
  }),
}

// Stub getRedisClient globally (since it's an auto-import in the handler)
vi.stubGlobal('getRedisClient', () => mockRedis)

describe('logs.get', () => {
  it('should fetch and sort logs by timestamp descending', async () => {
    const logsHandler = (await import('../../server/api/logs.get')).default

    const result = await logsHandler({} as any)

    expect(result).toHaveLength(3)

    // Expected order: 12:00, 11:00, 10:00
    expect(result[0].timestamp).toBe('2023-01-01T12:00:00Z')
    expect(result[1].timestamp).toBe('2023-01-01T11:00:00Z')
    expect(result[2].timestamp).toBe('2023-01-01T10:00:00Z')

    expect(result[0].service).toBe('worker')
    expect(result[1].service).toBe('webhook')
    expect(result[2].service).toBe('worker')
  })
})
