import type { LogEntry } from '~~/shared/types/LogEntry'
import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('defineEventHandler', <T>(handler: T) => handler)

const mockSession = {
  secure: { githubToken: 'mock-token' },
}
vi.stubGlobal('requireUserSession', vi.fn().mockResolvedValue(mockSession))

vi.mock('~~/server/utils/getUserInstallationIds', () => ({
  getUserInstallationIds: vi.fn().mockResolvedValue(new Set([123])),
}))

const mockRedis = {
  lrange: vi.fn().mockImplementation(async (key: string) => {
    if (key === 'janusz:logs:worker') {
      return Promise.resolve([
        JSON.stringify({ timestamp: '2023-01-01T10:00:00Z', service: 'worker', level: 'info', message: 'Worker log 1', meta: { installationId: 123 } }),
        JSON.stringify({ timestamp: '2023-01-01T12:00:00Z', service: 'worker', level: 'info', message: 'Worker log 2', meta: { installationId: 123 } }),
        JSON.stringify({ timestamp: '2023-01-01T14:00:00Z', service: 'worker', level: 'info', message: 'Other installation log', meta: { installationId: 456 } }),
      ])
    }
    if (key === 'janusz:logs:webhook') {
      return Promise.resolve([
        JSON.stringify({ timestamp: '2023-01-01T11:00:00Z', service: 'webhook', level: 'info', message: 'Webhook log', meta: { installationId: 123 } }),
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

vi.stubGlobal('getRedisClient', () => mockRedis)

describe('logs.get', () => {
  it('should fetch and filter logs by installationId, sorted descending', async () => {
    const module = await import('../../server/api/logs.get') as { default: (event: unknown) => Promise<LogEntry[]> }
    const logsHandler = module.default

    const result = await logsHandler({})

    expect(result).toHaveLength(3)

    expect(result[0].timestamp).toBe('2023-01-01T12:00:00Z')
    expect(result[1].timestamp).toBe('2023-01-01T11:00:00Z')
    expect(result[2].timestamp).toBe('2023-01-01T10:00:00Z')

    expect(result[0].service).toBe('worker')
    expect(result[1].service).toBe('webhook')
    expect(result[2].service).toBe('worker')
  })
})
