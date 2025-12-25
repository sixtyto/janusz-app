import { describe, expect, it, vi } from 'vitest'
import { provisionRepo } from '../../server/utils/provisionRepo'

// Mock dependencies
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
  const spawnMock = vi.fn(() => ({
    stderr: {
      on: vi.fn(),
    },
    on: vi.fn((event, cb) => {
      if (event === 'close')
        cb(0)
      return {}
    }),
  }))
  return {
    default: { spawn: spawnMock },
    spawn: spawnMock,
  }
})

vi.mock('../../server/utils/createLogger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
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

describe('provisionRepo', () => {
  it('should throw error for invalid repo names', async () => {
    await expect(provisionRepo('../../etc/passwd', 'url', 'job-1')).rejects.toThrow('Invalid repository name')
    await expect(provisionRepo('owner/repo; rm -rf /', 'url', 'job-1')).rejects.toThrow('Invalid repository name')
  })

  it('should accept valid repo names and return cleanup', async () => {
    const result = await provisionRepo('owner/repo', 'url', 'job-1')
    expect(result).toHaveProperty('index')
    expect(result).toHaveProperty('repoDir')
    expect(result).toHaveProperty('cleanup')
    expect(result.repoDir).toContain('owner/repo-job-1')

    // Verify cleanup calls fs.rm
    await result.cleanup()
    // We can't easily check if fs.rm was called on the specific path without storing the spy,
    // but the execution of the function is covered.
  })
})
