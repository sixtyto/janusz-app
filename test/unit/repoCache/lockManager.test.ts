import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acquireLock,
  cleanStaleLocks,
  isLockStale,
  isResourceLocked,
  releaseAllLocks,
  releaseLock,
} from '~~/server/utils/repoCache/lockManager'

vi.mock('../../../server/utils/useLogger', () => ({
  useLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

describe('lockManager', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `lock-manager-test-${Date.now()}`)
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await releaseAllLocks()
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('acquireLock', () => {
    it('should create lock file successfully', async () => {
      const resourcePath = path.join(testDir, 'test-resource')
      await fs.mkdir(resourcePath, { recursive: true })

      const acquired = await acquireLock(resourcePath, 'job-123')

      expect(acquired).toBe(true)

      const lockPath = `${resourcePath}.lock`
      const lockContent = await fs.readFile(lockPath, 'utf-8')
      const lockData = JSON.parse(lockContent)

      expect(lockData.pid).toBe(process.pid)
      expect(lockData.jobId).toBe('job-123')
      expect(lockData.hostname).toBe(os.hostname())
      expect(lockData.createdAt).toBeDefined()
    })

    it('should fail to acquire already locked resource', async () => {
      const resourcePath = path.join(testDir, 'test-resource')
      await fs.mkdir(resourcePath, { recursive: true })

      const firstAcquire = await acquireLock(resourcePath, 'job-1')
      expect(firstAcquire).toBe(true)

      const secondAcquire = await acquireLock(resourcePath, 'job-2')
      expect(secondAcquire).toBe(false)
    })

    it('should acquire stale lock', async () => {
      const resourcePath = path.join(testDir, 'test-resource')
      await fs.mkdir(resourcePath, { recursive: true })
      const lockPath = `${resourcePath}.lock`

      const staleLock = {
        pid: 99999999,
        createdAt: 1000,
        jobId: 'old-job',
        hostname: os.hostname(),
      }
      await fs.writeFile(lockPath, JSON.stringify(staleLock))

      const acquired = await acquireLock(resourcePath, 'new-job', { lockTimeoutMs: 1000 })
      expect(acquired).toBe(true)
    })
  })

  describe('releaseLock', () => {
    it('should remove lock file when releasing', async () => {
      const resourcePath = path.join(testDir, 'test-resource')
      await fs.mkdir(resourcePath, { recursive: true })
      const lockPath = `${resourcePath}.lock`

      await acquireLock(resourcePath, 'job-123')
      await expect(fs.access(lockPath)).resolves.toBeUndefined()

      await releaseLock(resourcePath)
      await expect(fs.access(lockPath)).rejects.toThrow()
    })

    it('should not remove lock owned by another process', async () => {
      const resourcePath = path.join(testDir, 'test-resource')
      await fs.mkdir(resourcePath, { recursive: true })
      const lockPath = `${resourcePath}.lock`

      const otherLock = {
        pid: process.pid + 1,
        createdAt: Date.now(),
        jobId: 'other-job',
        hostname: os.hostname(),
      }
      await fs.writeFile(lockPath, JSON.stringify(otherLock))

      await releaseLock(resourcePath)
      await expect(fs.access(lockPath)).resolves.toBeUndefined()
    })
  })

  describe('releaseAllLocks', () => {
    it('should release all locks held by this process', async () => {
      const resource1 = path.join(testDir, 'resource-1')
      const resource2 = path.join(testDir, 'resource-2')
      await fs.mkdir(resource1, { recursive: true })
      await fs.mkdir(resource2, { recursive: true })

      await acquireLock(resource1, 'job-1')
      await acquireLock(resource2, 'job-2')

      await releaseAllLocks()

      await expect(fs.access(`${resource1}.lock`)).rejects.toThrow()
      await expect(fs.access(`${resource2}.lock`)).rejects.toThrow()
    })
  })

  describe('isResourceLocked', () => {
    it('should return true for valid lock', async () => {
      const resourcePath = path.join(testDir, 'test-resource')
      await fs.mkdir(resourcePath, { recursive: true })

      await acquireLock(resourcePath, 'job-123')

      const locked = await isResourceLocked(resourcePath)
      expect(locked).toBe(true)
    })

    it('should return false for non-existent lock', async () => {
      const resourcePath = path.join(testDir, 'test-resource')

      const locked = await isResourceLocked(resourcePath)
      expect(locked).toBe(false)
    })

    it('should return false for stale lock', async () => {
      const resourcePath = path.join(testDir, 'test-resource')
      await fs.mkdir(resourcePath, { recursive: true })
      const lockPath = `${resourcePath}.lock`

      const staleLock = {
        pid: 99999999,
        createdAt: 1000,
        jobId: 'old-job',
        hostname: os.hostname(),
      }
      await fs.writeFile(lockPath, JSON.stringify(staleLock))

      const locked = await isResourceLocked(resourcePath, { lockTimeoutMs: 1000 })
      expect(locked).toBe(false)
    })
  })

  describe('isLockStale', () => {
    it('should detect timed out lock as stale', () => {
      const oldLock = {
        pid: process.pid,
        createdAt: 1000,
        jobId: 'job',
        hostname: os.hostname(),
      }

      expect(isLockStale(oldLock, { lockTimeoutMs: 1000 })).toBe(true)
    })

    it('should detect dead process lock as stale', () => {
      const deadProcessLock = {
        pid: 99999999,
        createdAt: Date.now(),
        jobId: 'job',
        hostname: os.hostname(),
      }

      expect(isLockStale(deadProcessLock)).toBe(true)
    })

    it('should not mark valid lock as stale', () => {
      const validLock = {
        pid: process.pid,
        createdAt: Date.now(),
        jobId: 'job',
        hostname: os.hostname(),
      }

      expect(isLockStale(validLock)).toBe(false)
    })
  })

  describe('cleanStaleLocks', () => {
    it('should remove stale locks from directory', async () => {
      const lockPath = path.join(testDir, 'resource.lock')

      const staleLock = {
        pid: 99999999,
        createdAt: 1000,
        jobId: 'old-job',
        hostname: os.hostname(),
      }
      await fs.writeFile(lockPath, JSON.stringify(staleLock))

      const cleaned = await cleanStaleLocks(testDir, { lockTimeoutMs: 1000 })

      expect(cleaned).toBe(1)
      await expect(fs.access(lockPath)).rejects.toThrow()
    })

    it('should not remove valid locks', async () => {
      const lockPath = path.join(testDir, 'resource.lock')

      const validLock = {
        pid: process.pid,
        createdAt: Date.now(),
        jobId: 'job',
        hostname: os.hostname(),
      }
      await fs.writeFile(lockPath, JSON.stringify(validLock))

      const cleaned = await cleanStaleLocks(testDir)

      expect(cleaned).toBe(0)
      await expect(fs.access(lockPath)).resolves.toBeUndefined()
    })
  })
})
