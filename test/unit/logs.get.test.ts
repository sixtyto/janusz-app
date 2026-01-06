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

const logsData = [
  JSON.stringify({ timestamp: '2023-01-01T10:00:00Z', service: 'worker', level: 'info', message: 'Worker log 1', meta: { installationId: 123 } }),
  JSON.stringify({ timestamp: '2023-01-01T12:00:00Z', service: 'worker', level: 'info', message: 'Worker log 2', meta: { installationId: 123 } }),
  JSON.stringify({ timestamp: '2023-01-01T11:00:00Z', service: 'webhook', level: 'info', message: 'Webhook log', meta: { installationId: 123 } }),
]

const mockPipeline = {
  lrange: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([
    [null, logsData], // Result for installation 123
  ]),
}

const mockRedis = {
  pipeline: vi.fn().mockReturnValue(mockPipeline),
}

vi.stubGlobal('getRedisClient', () => mockRedis)

describe('logs.get', () => {
  it('should fetch logs by installationId using pipeline', async () => {
    const module = await import('../../server/api/logs.get') as { default: (event: unknown) => Promise<LogEntry[]> }
    const logsHandler = module.default

    const result = await logsHandler({})

    expect(mockRedis.pipeline).toHaveBeenCalled()
    expect(mockPipeline.lrange).toHaveBeenCalledWith('janusz:logs:installation:123', 0, 999)
    expect(mockPipeline.exec).toHaveBeenCalled()

    expect(result).toHaveLength(3)
    expect(result[0].timestamp).toBe('2023-01-01T12:00:00Z')
    expect(result[1].timestamp).toBe('2023-01-01T11:00:00Z')
    expect(result[2].timestamp).toBe('2023-01-01T10:00:00Z')
  })
})
