// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { provisionRepo } from '~~/server/utils/provisionRepo'

vi.mock('node:fs', () => {
  const promises = {
    mkdir: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(''),
    stat: vi.fn().mockResolvedValue({ size: 100, isDirectory: () => false, isFile: () => true }),
    lstat: vi.fn().mockResolvedValue({
      size: 100,
      isDirectory: () => false,
      isFile: () => true,
      isSymbolicLink: () => false,
    }),
    rm: vi.fn().mockResolvedValue(undefined),
  }
  return {
    promises,
    default: { promises },
  }
})

vi.mock('node:child_process', async () => {
  const spawnMock = vi.fn((): { stderr: { on: ReturnType<typeof vi.fn> }, on: ReturnType<typeof vi.fn> } => ({
    stderr: {
      on: vi.fn(),
    },
    on: vi.fn((event: string, callback: (code: number) => void) => {
      if (event === 'close') {
        callback(0)
      }
      return {}
    }),
  }))
  return {
    default: { spawn: spawnMock },
    spawn: spawnMock,
  }
})

vi.mock('../../server/utils/useLogger', () => ({
  useLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('../../server/utils/getRedisClient', () => ({
  getRedisClient: () => ({
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    pipeline: vi.fn(() => ({
      del: vi.fn(),
      hset: vi.fn(),
      expire: vi.fn(),
      exec: vi.fn().mockResolvedValue([]),
    })),
  }),
}))

vi.mock('../../server/utils/jobContext', () => ({
  getJobContext: () => ({ jobId: 'test-job-id', installationId: 123 }),
}))

vi.mock('../../server/utils/repo-cache/lockManager', () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../server/utils/repo-cache/cleanupService', () => ({
  registerWorkTree: vi.fn(),
  unregisterWorkTree: vi.fn(),
}))

vi.mock('../../server/utils/repo-cache/constants', () => ({
  LOCK_FILE_EXTENSION: '.lock',
}))

describe('provisionRepo', () => {
  it('should throw error for invalid repo names', async () => {
    await expect(provisionRepo('../../etc/passwd', 'url')).rejects.toThrow('Invalid repository name')
    await expect(provisionRepo('owner/repo; rm -rf /', 'url')).rejects.toThrow('Invalid repository name')
  })

  it('should accept valid repo names and return cleanup', async () => {
    const result = await provisionRepo('owner/repo', 'url')
    expect(result).toHaveProperty('index')
    expect(result).toHaveProperty('repoDir')
    expect(result).toHaveProperty('cleanup')
    expect(result.repoDir).toContain('owner_repo-test-job-id')

    await result.cleanup()
  })
})
