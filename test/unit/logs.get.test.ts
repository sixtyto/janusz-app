import type { LogEntry } from '~~/shared/types/LogEntry'
import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('defineEventHandler', <T>(handler: T) => handler)

const mockSession = {
  secure: { githubToken: 'mock-token' },
}
vi.stubGlobal('requireUserSession', vi.fn().mockResolvedValue(mockSession))
vi.stubGlobal('createError', vi.fn((options: { message: string }) => new Error(options.message)))
vi.stubGlobal('getQuery', vi.fn().mockReturnValue({}))

vi.mock('~~/server/utils/getUserInstallationIds', () => ({
  getUserInstallationIds: vi.fn().mockResolvedValue(new Set([123])),
}))

const mockLogs = [
  {
    id: 1,
    installationId: 123,
    jobId: 'job-1',
    service: 'worker',
    level: 'info',
    message: 'Worker log 1',
    meta: { installationId: 123 },
    createdAt: new Date('2023-01-01T12:00:00Z'),
  },
  {
    id: 2,
    installationId: 123,
    jobId: 'job-2',
    service: 'webhook',
    level: 'info',
    message: 'Webhook log',
    meta: { installationId: 123 },
    createdAt: new Date('2023-01-01T11:00:00Z'),
  },
  {
    id: 3,
    installationId: 123,
    jobId: null,
    service: 'worker',
    level: 'info',
    message: 'Worker log 2',
    meta: { installationId: 123 },
    createdAt: new Date('2023-01-01T10:00:00Z'),
  },
]

const mockDatabaseQuery = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  offset: vi.fn().mockResolvedValue(mockLogs),
}

vi.mock('../../server/utils/useDatabase', () => ({
  useDatabase: vi.fn(() => mockDatabaseQuery),
}))

describe('logs.get', () => {
  it('should fetch logs from PostgreSQL and return them sorted by timestamp', async () => {
    const module = await import('../../server/api/logs.get') as { default: (event: unknown) => Promise<LogEntry[]> }
    const logsHandler = module.default

    const result = await logsHandler({})

    expect(mockDatabaseQuery.select).toHaveBeenCalled()
    expect(mockDatabaseQuery.from).toHaveBeenCalled()
    expect(mockDatabaseQuery.where).toHaveBeenCalled()
    expect(mockDatabaseQuery.orderBy).toHaveBeenCalled()
    expect(mockDatabaseQuery.limit).toHaveBeenCalled()
    expect(mockDatabaseQuery.offset).toHaveBeenCalled()

    expect(result).toHaveLength(3)
    expect(result[0].timestamp).toBe('2023-01-01T12:00:00.000Z')
    expect(result[1].timestamp).toBe('2023-01-01T11:00:00.000Z')
    expect(result[2].timestamp).toBe('2023-01-01T10:00:00.000Z')
  })
})
