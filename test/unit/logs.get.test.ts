import type { LogEntry } from '~~/shared/types/LogEntry'
import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('defineEventHandler', <T>(handler: T) => handler)

const mockSession = {
  secure: { githubToken: 'mock-token' },
}
vi.stubGlobal('requireUserSession', vi.fn().mockResolvedValue(mockSession))
vi.stubGlobal('createError', vi.fn((options: { message: string }) => new Error(options.message)))
vi.stubGlobal('getRequestURL', vi.fn().mockReturnValue({ pathname: '/api/logs' }))
vi.stubGlobal('getRequestIP', vi.fn().mockReturnValue('127.0.0.1'))
vi.stubGlobal('setHeader', vi.fn())
vi.stubGlobal('getUserSession', vi.fn().mockResolvedValue({ user: { id: 'test-user' } }))
vi.stubGlobal('getValidatedQuery', vi.fn().mockResolvedValue({ page: 1, limit: 20 }))
vi.stubGlobal('and', vi.fn((...conditions: unknown[]) => conditions))
vi.stubGlobal('count', vi.fn(() => ({ count: 3 })))

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

vi.mock('../../server/utils/useDatabase', () => ({
  useDatabase: vi.fn(() => {
    let isCountQuery = false

    return {
      select: vi.fn(function (this: any, arg: unknown) {
        isCountQuery = typeof arg === 'object' && arg !== null && 'count' in arg
        return this
      }),
      from: vi.fn().mockReturnThis(),
      where: vi.fn(function (this: any) {
        if (isCountQuery) {
          return Promise.resolve([{ count: 3 }])
        }
        return this
      }),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn(() => Promise.resolve(mockLogs)),
    }
  }),
}))

vi.mock('../../server/utils/getRedisClient', () => ({
  getRedisClient: vi.fn(() => ({
    eval: vi.fn().mockResolvedValue([1, 59, Date.now()]),
  })),
}))

vi.mock('../../server/utils/useLogger', () => ({
  useLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

describe('logs.get', () => {
  it('should fetch logs from PostgreSQL and return them sorted by timestamp with pagination', async () => {
    const module = await import('../../server/api/logs.get') as { default: (event: unknown) => Promise<{ logs: LogEntry[], total: number, page: number, limit: number }> }
    const logsHandler = module.default

    const result = await logsHandler({})

    expect(result.logs).toHaveLength(3)
    expect(result.total).toBe(3)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
    expect(result.logs[0].timestamp).toBe('2023-01-01T12:00:00.000Z')
    expect(result.logs[1].timestamp).toBe('2023-01-01T11:00:00.000Z')
    expect(result.logs[2].timestamp).toBe('2023-01-01T10:00:00.000Z')
  })
})
