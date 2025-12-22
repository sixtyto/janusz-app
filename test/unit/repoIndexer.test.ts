import { describe, expect, it, vi } from 'vitest'
import { updateRepoIndex } from '../../server/utils/repoIndexer'

// Mock dependencies
vi.mock('node:fs', () => {
  const promises = {
    mkdir: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(''),
    stat: vi.fn().mockResolvedValue({ size: 100, isDirectory: () => false, isFile: () => true }),
  }
  return {
    promises,
    default: { promises },
  }
})

vi.mock('node:child_process', async () => {
  const spawnMock = vi.fn(() => ({
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
    set: vi.fn(),
  }),
}))

describe('updateRepoIndex', () => {
  it('should throw error for invalid repo names', async () => {
    await expect(updateRepoIndex('../../etc/passwd', 'url')).rejects.toThrow('Invalid repository name')
    await expect(updateRepoIndex('owner/repo; rm -rf /', 'url')).rejects.toThrow('Invalid repository name')
  })

  it('should accept valid repo names', async () => {
    // We expect this to pass validation and attempt to run (mocked)
    await expect(updateRepoIndex('owner/repo', 'url')).resolves.not.toThrow()
    await expect(updateRepoIndex('owner/my-repo_123', 'url')).resolves.not.toThrow()
  })
})
