import type { CacheConfig, LockMetadata } from './types'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { ServiceType } from '#shared/types/ServiceType'
import { useLogger } from '../useLogger'
import { DEFAULT_CONFIG, LOCK_FILE_EXTENSION } from './constants'

const hostname = os.hostname()
const activeLocks = new Set<string>()

const logger = useLogger(ServiceType.repoIndexer)

function getLockPath(resourcePath: string): string {
  return `${resourcePath}${LOCK_FILE_EXTENSION}`
}

async function readLock(lockPath: string): Promise<LockMetadata | null> {
  try {
    const content = await fs.readFile(lockPath, 'utf-8')
    return JSON.parse(content) as LockMetadata
  } catch {
    return null
  }
}

async function removeLock(lockPath: string): Promise<void> {
  await fs.rm(lockPath, { force: true })
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error: any) {
    return error.code === 'EPERM'
  }
}

export function isLockStale(lockData: LockMetadata, config: Partial<CacheConfig> = {}): boolean {
  const lockTimeoutMs = config.lockTimeoutMs ?? DEFAULT_CONFIG.lockTimeoutMs

  const age = Date.now() - lockData.createdAt
  if (age > lockTimeoutMs) {
    return true
  }

  if (lockData.hostname === hostname && !isProcessAlive(lockData.pid)) {
    return true
  }

  return false
}

export async function acquireLock(
  resourcePath: string,
  jobId: string,
  config: Partial<CacheConfig> = {},
): Promise<boolean> {
  const lockPath = getLockPath(resourcePath)

  try {
    const existingLock = await readLock(lockPath)
    if (existingLock) {
      if (isLockStale(existingLock, config)) {
        logger.info('Removing stale lock', { lockPath, existingLock })
        await removeLock(lockPath)
      } else {
        return false
      }
    }

    const lockData: LockMetadata = {
      pid: process.pid,
      createdAt: Date.now(),
      jobId,
      hostname,
    }

    const parentDir = path.dirname(resourcePath)
    await fs.mkdir(parentDir, { recursive: true })
    await fs.writeFile(lockPath, JSON.stringify(lockData), { flag: 'wx' })
    activeLocks.add(lockPath)

    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return false
    }
    logger.error('Failed to acquire lock', { lockPath, error })
    return false
  }
}

export async function releaseLock(resourcePath: string): Promise<void> {
  const lockPath = getLockPath(resourcePath)

  try {
    const lockData = await readLock(lockPath)
    if (lockData && lockData.pid === process.pid && lockData.hostname === hostname) {
      await removeLock(lockPath)
      activeLocks.delete(lockPath)
    }
  } catch (error) {
    logger.error('Failed to release lock', { lockPath, error })
  }
}

export async function releaseAllLocks(): Promise<void> {
  const lockPaths = Array.from(activeLocks)
  await Promise.all(
    lockPaths.map(async (lockPath) => {
      try {
        await removeLock(lockPath)
      } catch {
        // Ignore errors during shutdown
      }
    }),
  )
  activeLocks.clear()
}

export async function isResourceLocked(
  resourcePath: string,
  config: Partial<CacheConfig> = {},
): Promise<boolean> {
  const lockPath = getLockPath(resourcePath)
  const lockData = await readLock(lockPath)

  if (!lockData) {
    return false
  }

  return !isLockStale(lockData, config)
}

export async function cleanStaleLocks(
  baseDir: string,
  config: Partial<CacheConfig> = {},
): Promise<number> {
  let cleaned = 0

  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.name.endsWith(LOCK_FILE_EXTENSION)) {
        const lockPath = `${baseDir}/${entry.name}`
        const lockData = await readLock(lockPath)

        if (lockData && isLockStale(lockData, config)) {
          await removeLock(lockPath)
          cleaned++
          logger.info('Cleaned stale lock', { lockPath })
        }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error('Failed to clean stale locks', { baseDir, error })
    }
  }

  return cleaned
}
