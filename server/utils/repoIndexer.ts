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

  async function runGit(args: string[], cwd?: string) {
    return new Promise<void>((resolve, reject) => {
      const proc = spawn('git', args, { cwd, stdio: 'ignore' })
      proc.on('close', (code) => {
        if (code === 0)
          resolve()
        else reject(new Error(`Git command failed with code ${code}`))
      })
      proc.on('error', reject)
    })
  }

  try {
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
      await runGit(['fetch', '--depth', '1', 'origin'], repoDir)
      await runGit(['reset', '--hard', 'FETCH_HEAD'], repoDir)
    }
  }
  catch (error) {
    logger.error(`Failed to sync repo ${repoFullName}`, { error })
    throw error
  }

  const index: Record<string, string[]> = {}

  async function scanDir(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const tasks = []

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (['.git', 'node_modules', 'dist', '.output', '.nuxt'].includes(entry.name))
          continue
        tasks.push(scanDir(fullPath))
      }
      else if (entry.isFile() && entry.name.match(/\.(ts|js|vue|go|py|php|java|rb|cs)$/) && !entry.name.endsWith('.d.ts')) {
        tasks.push((async () => {
          try {
            const stat = await fs.stat(fullPath)
            if (stat.size > 500 * 1024)
              return

            const content = await fs.readFile(fullPath, 'utf-8')
            const symbols = new Set<string>()

            const symbolRegex = /(?:export\s+)?(?:function|class|interface|struct|def|func|const|let|var)\s+(\w+)/g
            let match
            // eslint-disable-next-line no-cond-assign
            while ((match = symbolRegex.exec(content)) !== null) {
              if (match[1])
                symbols.add(match[1])
            }

            if (symbols.size > 0) {
              const relativePath = path.relative(repoDir, fullPath)
              index[relativePath] = Array.from(symbols)
            }
          }
          catch (e) {
            logger.warn(`Failed to process file ${fullPath}`, { error: e })
          }
        })())
      }
    }

    await Promise.all(tasks)
  }

  await scanDir(repoDir)

  await redis.set(`janusz:index:${repoFullName}`, JSON.stringify(index), 'EX', 60 * 60 * 24)

  return {
    index,
    repoDir,
  }
}
