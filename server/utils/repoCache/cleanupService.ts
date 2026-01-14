import type { CacheConfig, CleanupResult, LockMetadata } from './types'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { ServiceType } from '#shared/types/ServiceType'
import { useLogger } from '../useLogger'
import { DEFAULT_CONFIG, LOCK_FILE_EXTENSION } from './constants'
import { cleanStaleLocks, isLockStale, releaseAllLocks } from './lockManager'

const activeWorkTrees = new Set<string>()

const logger = useLogger(ServiceType.repoIndexer)

let cleanupInterval: NodeJS.Timeout | null = null
let isShuttingDown = false
let currentConfig: CacheConfig = { ...DEFAULT_CONFIG }

export function configureCleanup(config: Partial<CacheConfig>): void {
  currentConfig = { ...DEFAULT_CONFIG, ...config }
}

export function registerWorkTree(workTreePath: string): void {
  activeWorkTrees.add(workTreePath)
}

export function unregisterWorkTree(workTreePath: string): void {
  activeWorkTrees.delete(workTreePath)
}

export function startPeriodicCleanup(intervalMs: number = currentConfig.cleanupIntervalMs): void {
  if (cleanupInterval) {
    return
  }

  logger.info('Starting periodic cleanup', { intervalMs })

  cleanupInterval = setInterval(() => {
    if (!isShuttingDown) {
      void runCleanup()
    }
  }, intervalMs)

  cleanupInterval.unref()
}

export function stopPeriodicCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
    logger.info('Stopped periodic cleanup')
  }
}

export async function runCleanup(config: Partial<CacheConfig> = {}): Promise<CleanupResult> {
  const cfg = { ...currentConfig, ...config }
  const result: CleanupResult = {
    orphanedWorkTreesCleaned: 0,
    staleLocksCleaned: 0,
    bytesFreed: 0,
    errors: [],
  }

  try {
    logger.info('Running cleanup cycle')

    const orphanResult = await cleanupOrphanedWorkTrees(cfg)
    result.orphanedWorkTreesCleaned = orphanResult.count
    result.bytesFreed = orphanResult.bytesFreed
    result.errors.push(...orphanResult.errors)

    result.staleLocksCleaned = await cleanStaleLocks(cfg.baseDir, cfg)

    logger.info('Cleanup cycle completed', {
      orphanedWorkTreesCleaned: result.orphanedWorkTreesCleaned,
      staleLocksCleaned: result.staleLocksCleaned,
      bytesFreed: result.bytesFreed,
      errorCount: result.errors.length,
    })
  } catch (error) {
    logger.error('Cleanup cycle failed', { error })
    result.errors.push(error instanceof Error ? error : new Error(String(error)))
  }

  return result
}

export async function startupCleanup(config: Partial<CacheConfig> = {}): Promise<CleanupResult> {
  logger.info('Running startup cleanup (crash recovery)')
  return runCleanup(config)
}

export async function shutdownCleanup(): Promise<void> {
  isShuttingDown = true
  stopPeriodicCleanup()

  logger.info('Running shutdown cleanup')

  const workTrees = Array.from(activeWorkTrees)

  await Promise.all(
    workTrees.map(async (workTreePath) => {
      try {
        await cleanupWorkTree(workTreePath)
      } catch (error) {
        logger.error('Failed to cleanup work tree during shutdown', { workTreePath, error })
      }
    }),
  )

  await releaseAllLocks()

  logger.info('Shutdown cleanup completed', { workTreesCleaned: workTrees.length })
}

export function markShuttingDown(): void {
  isShuttingDown = true
}

async function cleanupOrphanedWorkTrees(
  config: CacheConfig,
): Promise<{ count: number, bytesFreed: number, errors: Error[] }> {
  const result = { count: 0, bytesFreed: 0, errors: [] as Error[] }

  try {
    const entries = await fs.readdir(config.baseDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }

      if (entry.name === 'cache') {
        continue
      }

      const workTreePath = path.join(config.baseDir, entry.name)

      if (activeWorkTrees.has(workTreePath)) {
        continue
      }

      try {
        const shouldCleanup = await shouldCleanupWorkTree(workTreePath, config)
        if (shouldCleanup) {
          const size = await getDirectorySize(workTreePath)
          await cleanupWorkTree(workTreePath)
          result.count++
          result.bytesFreed += size
          logger.info('Cleaned orphaned work tree', { workTreePath, size })
        }
      } catch (error) {
        logger.error('Failed to process work tree', { workTreePath, error })
        result.errors.push(error instanceof Error ? error : new Error(String(error)))
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error('Failed to read base directory', { baseDir: config.baseDir, error })
      result.errors.push(error instanceof Error ? error : new Error(String(error)))
    }
  }

  return result
}

async function shouldCleanupWorkTree(workTreePath: string, config: CacheConfig): Promise<boolean> {
  const lockPath = `${workTreePath}${LOCK_FILE_EXTENSION}`

  try {
    const lockContent = await fs.readFile(lockPath, 'utf-8')
    const lockData = JSON.parse(lockContent) as LockMetadata

    if (isLockStale(lockData, config)) {
      return true
    }

    return false
  } catch {
    try {
      const stat = await fs.stat(workTreePath)
      const age = Date.now() - stat.mtimeMs

      return age > config.staleWorkTreeAgeMs
    } catch {
      return false
    }
  }
}

async function cleanupWorkTree(workTreePath: string): Promise<void> {
  const lockPath = `${workTreePath}${LOCK_FILE_EXTENSION}`

  await fs.rm(workTreePath, { recursive: true, force: true })
  await fs.rm(lockPath, { force: true })

  activeWorkTrees.delete(workTreePath)
}

async function getDirectorySize(dirPath: string): Promise<number> {
  let size = 0

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        size += await getDirectorySize(fullPath)
      } else {
        try {
          const stat = await fs.stat(fullPath)
          size += stat.size
        } catch {
          // Ignore stat errors
        }
      }
    }
  } catch {
    // Ignore readdir errors
  }

  return size
}
