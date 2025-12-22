import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createLogger } from './createLogger'
import { getRedisClient } from './getRedisClient'

export async function updateRepoIndex(repoFullName: string, cloneUrl: string) {
  const logger = createLogger('repo-indexer')
  const redis = getRedisClient()

  const safeRepoName = repoFullName.replace(/[^\w\-/]/g, '')
  if (safeRepoName !== repoFullName || repoFullName.includes('..')) {
    throw new Error(`Invalid repository name: ${repoFullName}`)
  }

  const baseDir = path.join(os.tmpdir(), 'janusz-repos')
  const repoDir = path.join(baseDir, safeRepoName)

  if (!repoDir.startsWith(baseDir)) {
    throw new Error('Path traversal detected')
  }

  async function acquireLock(key: string, ttlSeconds: number, timeoutMs: number): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const result = await redis.set(key, 'locked', 'EX', ttlSeconds, 'NX')
      if (result === 'OK')
        return true
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    return false
  }

  const lockKey = `lock:repo:${safeRepoName}`
  const hasLock = await acquireLock(lockKey, 300, 30000)
  if (!hasLock) {
    throw new Error(`Could not acquire lock for repository ${safeRepoName}`)
  }

  try {
    async function runGit(args: string[], cwd?: string) {
      return new Promise<void>((resolve, reject) => {
        const proc = spawn('git', args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] })
        let stderr = ''

        if (proc.stderr) {
          proc.stderr.on('data', (data) => {
            stderr += data.toString()
          })
        }

        proc.on('close', (code) => {
          if (code === 0)
            resolve()
          else reject(new Error(`Git command failed with code ${code}: ${stderr}`))
        })
        proc.on('error', reject)
      })
    }

    let repoExists: boolean
    try {
      await fs.access(repoDir)
      repoExists = true
    }
    catch {
      repoExists = false
    }

    if (!repoExists) {
      logger.info(`Cloning ${repoFullName} to ${repoDir}`)
      await fs.mkdir(path.dirname(repoDir), { recursive: true })
      await runGit(['clone', '--depth', '1', cloneUrl, repoDir])
    }
    else {
      logger.info(`Updating ${repoFullName} in ${repoDir}`)
      try {
        await runGit(['rev-parse', '--is-inside-work-tree'], repoDir)
        await runGit(['fetch', '--depth', '1', 'origin'], repoDir)
        await runGit(['reset', '--hard', 'FETCH_HEAD'], repoDir)
      }
      catch (err) {
        logger.warn(`Repository at ${repoDir} is corrupt or invalid. Re-cloning.`, { error: err })
        await fs.rm(repoDir, { recursive: true, force: true })
        await fs.mkdir(path.dirname(repoDir), { recursive: true })
        await runGit(['clone', '--depth', '1', cloneUrl, repoDir])
      }
    }
  }
  catch (error) {
    logger.error(`Failed to sync repo ${repoFullName}`, { error })
    throw error
  }
  finally {
    await redis.del(lockKey)
  }

  const index: Record<string, string[]> = {}

  const MAX_CONCURRENCY = 50
  let activeTasks = 0
  const queue: (() => Promise<void>)[] = []

  function enqueue(task: () => Promise<void>) {
    return new Promise<void>((resolve, reject) => {
      const wrappedTask = async () => {
        try {
          await task()
          resolve()
        }
        catch (e) {
          reject(e)
        }
        finally {
          activeTasks--
          if (queue.length > 0) {
            activeTasks++
            const next = queue.shift()
            next?.()
          }
        }
      }

      if (activeTasks < MAX_CONCURRENCY) {
        activeTasks++
        wrappedTask()
      }
      else {
        queue.push(wrappedTask)
      }
    })
  }

  async function processFile(fullPath: string) {
    try {
      const stat = await fs.stat(fullPath)
      if (stat.size > 500 * 1024)
        return

      let content = await fs.readFile(fullPath, 'utf-8')

      content = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')

      const symbols = new Set<string>()

      const symbolPatterns = [
        // Destructuring: const { a: b, c } = ... or const [a, b] = ...
        /(?:export\s+)?(?:const|let|var)\s+[{[]([\w,\s:]+)[}\]]\s*=/g,
        // Standard Assignments: const x = ...
        /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/g,
        // Declarations: function x(), class Y, etc. Handles 'export default function'
        /(?:export\s+(?:default\s+)?)?(?:function|class|interface|type|enum)\s+(\w+)/g,
      ]

      for (const pattern of symbolPatterns) {
        pattern.lastIndex = 0
        let match
        // eslint-disable-next-line no-cond-assign
        while ((match = pattern.exec(content)) !== null) {
          if (match[1]) {
            // For destructuring, we might have multiple parts separated by comma
            const rawParts = match[1].split(',')
            for (const rawPart of rawParts) {
              const part = rawPart.trim()
              if (!part)
                continue

              // Handle aliased destructuring: { a: b } -> we want 'b'
              if (part.includes(':')) {
                const alias = part.split(':').pop()?.trim()
                if (alias && /^\w+$/.test(alias))
                  symbols.add(alias)
              }
              else if (/^\w+$/.test(part)) {
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
    }
    catch (e) {
      logger.warn(`Failed to process file ${fullPath}`, { error: e })
    }
  }

  async function scanDir(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const promises = []

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (['.git', 'node_modules', 'dist', '.output', '.nuxt'].includes(entry.name))
          continue
        promises.push(scanDir(fullPath))
      }
      else if (entry.isFile() && entry.name.match(/\.(ts|js|vue|go|py|php|java|rb|cs)$/) && !entry.name.endsWith('.d.ts')) {
        promises.push(enqueue(() => processFile(fullPath)))
      }
    }

    await Promise.all(promises)
  }

  await scanDir(repoDir)

  const redisKey = `janusz:index:${repoFullName}`

  if (Object.keys(index).length > 0) {
    const pipeline = redis.pipeline()
    pipeline.del(redisKey)

    for (const [file, symbols] of Object.entries(index)) {
      pipeline.hset(redisKey, file, JSON.stringify(symbols))
    }
    pipeline.expire(redisKey, 60 * 60 * 24)
    await pipeline.exec()
  }

  return {
    index,
    repoDir,
  }
}
