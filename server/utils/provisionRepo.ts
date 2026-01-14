import type { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ServiceType } from '#shared/types/ServiceType'
import { getRedisClient } from './getRedisClient'
import { getJobContext } from './jobContext'
import { registerWorkTree, unregisterWorkTree } from './repoCache/cleanupService'
import { acquireLock, releaseLock } from './repoCache/lockManager'
import { extractSymbols, initializeTreeSitter } from './treeSitterParser'
import { useLogger } from './useLogger'

export async function provisionRepo(repoFullName: string, cloneUrl: string) {
  const context = getJobContext()
  const jobId = context?.jobId ?? crypto.randomUUID()
  const logger = useLogger(ServiceType.repoIndexer)
  const redis = getRedisClient()

  logger.info('Initializing tree-sitter parser')
  await initializeTreeSitter().catch((error) => {
    logger.warn('Tree-sitter initialization failed, will use regex fallback', { error })
  })

  if (!/^[\w-]+\/[\w.-]+$/.test(repoFullName)) {
    throw new Error(`Invalid repository name: ${repoFullName}`)
  }

  const safeRepoName = repoFullName.replace(/[^\w.-]/g, '_')

  const baseDir = path.join(os.tmpdir(), 'janusz-repos')
  const repoDir = path.join(baseDir, `${safeRepoName}-${jobId}`)

  if (!repoDir.startsWith(baseDir)) {
    throw new Error('Path traversal detected')
  }

  try {
    async function runGit(args: string[], cwd?: string) {
      return new Promise<void>((resolve, reject) => {
        const proc = spawn('git', args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] })
        let stderr = ''

        if (proc.stderr) {
          proc.stderr.on('data', (data: Buffer) => {
            stderr += data.toString()
          })
        }

        proc.on('close', (code) => {
          if (code === 0) {
            resolve()
          } else {
            reject(new Error(`Git command failed with code ${code}: ${stderr}`))
          }
        })
        proc.on('error', reject)
      })
    }

    logger.info(`Cloning ${repoFullName} to ${repoDir}`)
    await fs.mkdir(path.dirname(repoDir), { recursive: true })
    try {
      const lockAcquired = await acquireLock(repoDir, jobId)
      if (!lockAcquired) {
        throw new Error(`Failed to acquire lock for ${repoDir}`)
      }
      registerWorkTree(repoDir)

      await runGit(['clone', '--depth', '1', cloneUrl, repoDir])
    } catch (err) {
      await fs.rm(repoDir, { recursive: true, force: true }).catch(() => {})
      await releaseLock(repoDir)
      unregisterWorkTree(repoDir)
      throw err
    }
  } catch (error) {
    logger.error(`Failed to sync repo ${repoFullName}`, { error })
    throw error
  }

  const index: Record<string, string[]> = {}

  const MAX_CONCURRENCY = 50
  let activeTasks = 0
  const queue: (() => Promise<void>)[] = []

  async function enqueue(task: () => Promise<void>) {
    return new Promise<void>((resolve, reject) => {
      const wrappedTask = async () => {
        try {
          await task()
          resolve()
        } catch (e) {
          reject(e)
        } finally {
          activeTasks--
          if (queue.length > 0) {
            activeTasks++
            const next = queue.shift()
            void next?.()
          }
        }
      }

      if (activeTasks < MAX_CONCURRENCY) {
        activeTasks++
        void wrappedTask()
      } else {
        queue.push(wrappedTask)
      }
    })
  }

  async function processFile(fullPath: string) {
    try {
      const stat = await fs.lstat(fullPath)
      if (stat.isSymbolicLink() || stat.size > 500 * 1024) {
        return
      }

      const content = await fs.readFile(fullPath, 'utf-8')
      const extension = path.extname(fullPath).toLowerCase()

      // Try AST parsing first
      const astSymbols = await extractSymbols(content, extension)

      if (astSymbols !== null) {
        if (astSymbols.length > 0) {
          const relativePath = path.relative(repoDir, fullPath)
          index[relativePath] = astSymbols
          logger.info(`Extracted ${astSymbols.length} symbols via AST`, { file: relativePath })
        }
        return
      }

      // Fallback to regex for unsupported extensions
      logger.info(`Using regex fallback for ${extension}`)
      const strippedContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
      const symbols = new Set<string>()

      const symbolPatterns = [
        /(?:export\s+)?(?:const|let|var)\s+[{[]([\w,\s:]+)[}\]]\s*=/g,
        /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/g,
        /(?:export\s+(?:default\s+)?)?(?:function|class|interface|type|enum)\s+(\w+)/g,
      ]

      for (const pattern of symbolPatterns) {
        pattern.lastIndex = 0
        let match
        // eslint-disable-next-line no-cond-assign
        while ((match = pattern.exec(strippedContent)) !== null) {
          if (match[1]) {
            const rawParts = match[1].split(',')
            for (const rawPart of rawParts) {
              const part = rawPart.trim()
              if (!part) {
                continue
              }

              if (part.includes(':')) {
                const alias = part.split(':').pop()?.trim()
                if (alias && /^\w+$/.test(alias)) {
                  symbols.add(alias)
                }
              } else if (/^\w+$/.test(part)) {
                symbols.add(part)
              }
            }
          }
        }
      }

      if (symbols.size > 0) {
        const relativePath = path.relative(repoDir, fullPath)
        index[relativePath] = Array.from(symbols)
      }
    } catch (error) {
      logger.warn(`Failed to process file ${fullPath}`, { error })
    }
  }

  async function scanDir(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    const BATCH_SIZE = 50
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE)
      const promises = []

      for (const entry of batch) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          if (['.git', 'node_modules', 'dist', '.output', '.nuxt'].includes(entry.name)) {
            continue
          }
          promises.push(scanDir(fullPath))
        } else if (entry.isFile() && entry.name.match(/\.(ts|js|vue|go|py|php|java|rb|cs)$/) && !entry.name.endsWith('.d.ts')) {
          promises.push(enqueue(async () => processFile(fullPath)))
        }
      }

      if (promises.length > 0) {
        await Promise.all(promises)
      }
    }
  }

  logger.info(`Starting file scan for indexing: ${repoFullName}`, { repoDir })
  await scanDir(repoDir)

  const redisKey = `janusz:index:${repoFullName}:${jobId}`
  const fileCount = Object.keys(index).length
  const symbolCount = Object.values(index).reduce((acc, symbols) => acc + symbols.length, 0)

  const REPO_INDEX_TTL_SECONDS = 60 * 60

  if (fileCount > 0) {
    const pipeline = redis.pipeline()
    pipeline.del(redisKey)

    for (const [file, symbols] of Object.entries(index)) {
      pipeline.hset(redisKey, file, JSON.stringify(symbols))
    }
    pipeline.expire(redisKey, REPO_INDEX_TTL_SECONDS)
    await pipeline.exec()
  }

  logger.info(`Repository indexing completed: ${repoFullName}`, {
    fileCount,
    symbolCount,
    index: JSON.stringify(index, null, 2),
  })

  return {
    index,
    repoDir,
    cleanup: async () => {
      try {
        await fs.rm(repoDir, { recursive: true, force: true })
      } catch (e) {
        logger.error(`Failed to cleanup repo dir ${repoDir}`, { error: e })
      } finally {
        await releaseLock(repoDir)
        unregisterWorkTree(repoDir)
      }
    },
  }
}
