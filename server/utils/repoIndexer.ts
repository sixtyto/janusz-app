import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export async function updateRepoIndex(repoFullName: string, cloneUrl: string) {
  const logger = createLogger('repo-indexer')
  const redis = getRedisClient()

  const baseDir = path.join(os.tmpdir(), 'janusz-repos')
  const repoDir = path.join(baseDir, repoFullName)

  try {
    if (!fs.existsSync(repoDir)) {
      logger.info(`Cloning ${repoFullName} to ${repoDir}`)
      fs.mkdirSync(path.dirname(repoDir), { recursive: true })
      spawnSync('git', ['clone', '--depth', '1', cloneUrl, repoDir], { stdio: 'ignore' })
    }
    else {
      logger.info(`Updating ${repoFullName} in ${repoDir}`)
      spawnSync('git', ['-C', repoDir, 'fetch', '--depth', '1', 'origin'], { stdio: 'ignore' })
      spawnSync('git', ['-C', repoDir, 'reset', '--hard', 'FETCH_HEAD'], { stdio: 'ignore' })
    }
  }
  catch (error) {
    logger.error(`Failed to sync repo ${repoFullName}`, { error })
    throw error
  }

  const index: Record<string, string[]> = {}

  function scanDir(dir: string) {
    const files = fs.readdirSync(dir)
    const symbolRegex = /(?:export\s+)?(?:function|class|interface|struct|def|func|const|let|var)\s+(\w+)/g

    for (const file of files) {
      const fullPath = path.join(dir, file)
      const stat = fs.statSync(fullPath)

      if (stat.isDirectory()) {
        if (file === '.git' || file === 'node_modules' || file === 'dist' || file === '.output' || file === '.nuxt')
          continue
        scanDir(fullPath)
      }
      else if (file.match(/\.(ts|js|vue|go|py|php|java|rb|cs)$/) && !file.endsWith('.d.ts')) {
        if (stat.size > 500 * 1024)
          continue

        try {
          const content = fs.readFileSync(fullPath, 'utf-8')
          const symbols = new Set<string>()

          symbolRegex.lastIndex = 0 // Reset regex state
          let match = symbolRegex.exec(content)
          while (match !== null) {
            if (match[1])
              symbols.add(match[1])
            match = symbolRegex.exec(content)
          }
          if (symbols.size > 0) {
            const relativePath = path.relative(repoDir, fullPath)
            index[relativePath] = Array.from(symbols)
          }
        }
        catch {
          // Ignore read errors
        }
      }
    }
  }

  scanDir(repoDir)

  await redis.set(`janusz:index:${repoFullName}`, JSON.stringify(index), 'EX', 60 * 60 * 24)

  return {
    index,
    repoDir,
  }
}
