import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  configureCleanup,
  registerWorkTree,
  runCleanup,
  shutdownCleanup,
  startPeriodicCleanup,
  startupCleanup,
  stopPeriodicCleanup,
} from '~~/server/utils/repoCache/cleanupService'

vi.mock('../../../server/utils/useLogger', () => ({
  useLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

describe('cleanupService', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `cleanup-service-test-${Date.now()}`)
    await fs.mkdir(testDir, { recursive: true })
    configureCleanup({
      baseDir: testDir,
      staleWorkTreeAgeMs: 1000,
      lockTimeoutMs: 1000,
    })
  })

  afterEach(async () => {
    stopPeriodicCleanup()
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('registerWorkTree/unregisterWorkTree', () => {
    it('should track registered work trees', () => {
      const workTreePath = path.join(testDir, 'work-tree-1')
      registerWorkTree(workTreePath)
    })
  })

  describe('runCleanup', () => {
    it('should cleanup orphaned work trees without lock files', async () => {
      const orphanDir = path.join(testDir, 'orphan-repo-job123')
      await fs.mkdir(orphanDir, { recursive: true })

      await new Promise(resolve => setTimeout(resolve, 1100))

      const result = await runCleanup()

      expect(result.orphanedWorkTreesCleaned).toBe(1)
      await expect(fs.access(orphanDir)).rejects.toThrow()
    })

    it('should cleanup work trees with stale locks', async () => {
      const workDir = path.join(testDir, 'stale-repo-job456')
      await fs.mkdir(workDir, { recursive: true })

      const lockPath = `${workDir}.lock`
      const staleLock = {
        pid: 99999999,
        createdAt: 1000,
        jobId: 'old-job',
        hostname: os.hostname(),
      }
      await fs.writeFile(lockPath, JSON.stringify(staleLock))

      const result = await runCleanup()

      expect(result.orphanedWorkTreesCleaned).toBe(1)
      await expect(fs.access(workDir)).rejects.toThrow()
      await expect(fs.access(lockPath)).rejects.toThrow()
    })

    it('should NOT cleanup work trees with valid locks', async () => {
      const workDir = path.join(testDir, 'active-repo-job789')
      await fs.mkdir(workDir, { recursive: true })

      const lockPath = `${workDir}.lock`
      const validLock = {
        pid: process.pid,
        createdAt: Date.now(),
        jobId: 'active-job',
        hostname: os.hostname(),
      }
      await fs.writeFile(lockPath, JSON.stringify(validLock))

      const result = await runCleanup()

      expect(result.orphanedWorkTreesCleaned).toBe(0)
      await expect(fs.access(workDir)).resolves.toBeUndefined()
    })

    it('should NOT cleanup registered work trees', async () => {
      const workDir = path.join(testDir, 'registered-repo-jobabc')
      await fs.mkdir(workDir, { recursive: true })

      registerWorkTree(workDir)

      await new Promise(resolve => setTimeout(resolve, 1100))

      const result = await runCleanup()

      expect(result.orphanedWorkTreesCleaned).toBe(0)
      await expect(fs.access(workDir)).resolves.toBeUndefined()
    })

    it('should skip cache directory', async () => {
      const cacheDir = path.join(testDir, 'cache')
      await fs.mkdir(cacheDir, { recursive: true })

      await new Promise(resolve => setTimeout(resolve, 1100))

      const result = await runCleanup()

      expect(result.orphanedWorkTreesCleaned).toBe(0)
      await expect(fs.access(cacheDir)).resolves.toBeUndefined()
    })
  })

  describe('startupCleanup', () => {
    it('should run cleanup on startup', async () => {
      const orphanDir = path.join(testDir, 'orphan-startup-test')
      await fs.mkdir(orphanDir, { recursive: true })

      await new Promise(resolve => setTimeout(resolve, 1100))

      const result = await startupCleanup()

      expect(result.orphanedWorkTreesCleaned).toBe(1)
    })
  })

  describe('shutdownCleanup', () => {
    it('should cleanup all registered work trees on shutdown', async () => {
      const workDir1 = path.join(testDir, 'work-1')
      const workDir2 = path.join(testDir, 'work-2')
      await fs.mkdir(workDir1, { recursive: true })
      await fs.mkdir(workDir2, { recursive: true })

      const lock1 = {
        pid: process.pid,
        createdAt: Date.now(),
        jobId: 'job-1',
        hostname: os.hostname(),
      }
      const lock2 = {
        pid: process.pid,
        createdAt: Date.now(),
        jobId: 'job-2',
        hostname: os.hostname(),
      }
      await fs.writeFile(`${workDir1}.lock`, JSON.stringify(lock1))
      await fs.writeFile(`${workDir2}.lock`, JSON.stringify(lock2))

      registerWorkTree(workDir1)
      registerWorkTree(workDir2)

      await shutdownCleanup()

      await expect(fs.access(workDir1)).rejects.toThrow()
      await expect(fs.access(workDir2)).rejects.toThrow()
    })
  })

  describe('startPeriodicCleanup/stopPeriodicCleanup', () => {
    it('should start and stop without errors', () => {
      startPeriodicCleanup(60000) // Long interval to avoid actual cleanup during test
      stopPeriodicCleanup()
    })

    it('should not start multiple intervals', () => {
      startPeriodicCleanup(60000)
      startPeriodicCleanup(60000)
      stopPeriodicCleanup()
    })
  })
})
