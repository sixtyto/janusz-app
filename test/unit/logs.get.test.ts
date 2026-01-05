import type { LogEntry } from '~~/shared/types/LogEntry'
import { describe, expect, it, vi } from 'vitest'

vi.mock('~~/server/utils/getUserInstallationIds', () => ({
  getUserInstallationIds: vi.fn().mockResolvedValue(new Set([12345])),
}))
vi.stubGlobal('defineEventHandler', <T>(handler: T) => handler)
vi.stubGlobal('requireUserSession', vi.fn().mockResolvedValue({
  user: { login: 'testuser' },
  secure: { githubToken: 'test-token' },
}))
vi.stubGlobal('createError', (options: { status: number, message: string }) => new Error(options.message))

const mockRedis = {
  lrange: vi.fn().mockImplementation(async (key: string) => {
    if (key === 'janusz:logs:installation:12345') {
      return Promise.resolve([
        JSON.stringify({ timestamp: '2023-01-01T12:00:00Z', service: 'worker', level: 'info', message: 'Worker log 2', meta: { installationId: 12345 } }),
        JSON.stringify({ timestamp: '2023-01-01T11:00:00Z', service: 'webhook', level: 'info', message: 'Webhook log', meta: { installationId: 12345 } }),
        JSON.stringify({ timestamp: '2023-01-01T10:00:00Z', service: 'worker', level: 'info', message: 'Worker log 1', meta: { installationId: 12345 } }),
      ])
    }
    return Promise.resolve([])
  }),
}
vi.stubGlobal('getRedisClient', () => mockRedis)

describe('logs.get', () => {
  it('should fetch and sort logs by timestamp descending', async () => {
    const module = await import('../../server/api/logs.get') as { default: (event: unknown) => Promise<LogEntry[]> }
    const logsHandler = module.default

    const result = await logsHandler({} as unknown)

    expect(result).toHaveLength(3)

    expect(result[0].timestamp).toBe('2023-01-01T12:00:00Z')
    expect(result[1].timestamp).toBe('2023-01-01T11:00:00Z')
    expect(result[2].timestamp).toBe('2023-01-01T10:00:00Z')

    expect(result[0].service).toBe('worker')
    expect(result[1].service).toBe('webhook')
    expect(result[2].service).toBe('worker')
  })

  it('should filter out logs from other installations', async () => {
    mockRedis.lrange.mockImplementation(async (key: string) => {
      if (key === 'janusz:logs:installation:12345') {
        return Promise.resolve([
          JSON.stringify({ timestamp: '2023-01-01T10:00:00Z', service: 'worker', level: 'info', message: 'Accessible log', meta: { installationId: 12345 } }),
        ])
      }
      if (key === 'janusz:logs:installation:99999') {
        return Promise.resolve([
          JSON.stringify({ timestamp: '2023-01-01T11:00:00Z', service: 'worker', level: 'info', message: 'Inaccessible log', meta: { installationId: 99999 } }),
        ])
      }
      return Promise.resolve([])
    })

    const module = await import('../../server/api/logs.get') as { default: (event: unknown) => Promise<LogEntry[]> }
    const logsHandler = module.default

    const result = await logsHandler({} as unknown)

    expect(result).toHaveLength(1)
    expect(result[0].message).toBe('Accessible log')
  })
})
