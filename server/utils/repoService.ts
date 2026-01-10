import { promises as fs } from 'node:fs'
import path from 'node:path'
import { ServiceType } from '#shared/types/ServiceType'
import { createGitHubClient } from '~~/server/utils/createGitHubClient'
import { provisionRepo } from '~~/server/utils/provisionRepo'
import { selectContextFiles } from '~~/server/utils/selectContextFiles'
import { useLogger } from '~~/server/utils/useLogger'

const logger = useLogger(ServiceType.worker)

export async function processRepoContext(
  repositoryFullName: string,
  installationId: number,
  diffs: FileDiff[],
): Promise<Record<string, string>> {
  const extraContext: Record<string, string> = {}
  let cleanup: (() => Promise<void>) | undefined

  const github = createGitHubClient(installationId)

  try {
    logger.info(`🧠 Enhancing context for ${repositoryFullName}`)
    const token = await github.getToken()
    const cloneUrl = `https://x-access-token:${token}@github.com/${repositoryFullName}.git`

    const {
      index,
      repoDir,
      cleanup: cleanupFn,
    } = await provisionRepo(repositoryFullName, cloneUrl)
    cleanup = cleanupFn

    const suggestedFiles = await selectContextFiles(index, diffs)
    logger.info(`🤖 Maciej suggested ${suggestedFiles.length} files`, { suggestedFiles })

    const diffFiles = new Set(diffs.map(d => d.filename))
    const filesToRead = new Set(suggestedFiles.filter(f => !diffFiles.has(f)))

    for (const file of filesToRead) {
      const fullPath = path.resolve(repoDir, file)
      if (!fullPath.startsWith(repoDir)) {
        logger.warn(`🚫 Potential path traversal attempt blocked: ${file}`)
        continue
      }

      try {
        const stat = await fs.lstat(fullPath)
        if (stat.isSymbolicLink()) {
          logger.info(`⏭️ Skipping symlink: ${file}`)
          continue
        }
        if (stat.isDirectory()) {
          logger.info(`⏭️ Skipping directory: ${file}`)
          continue
        }
        if (stat.size > 500 * 1024) {
          logger.warn(`⏭️ Skipping large file (>500KB): ${file} (${stat.size} bytes)`)
          continue
        }

        extraContext[file] = await fs.readFile(fullPath, 'utf-8')
        logger.info(`📄 Added context file: ${file}`)
      } catch (error) {
        logger.warn(`⚠️ Failed to read context file: ${file}`, { error })
      }
    }
  } catch (error) {
    logger.error('⚠️ Failed to enhance context, proceeding with basic diff', { error })
  } finally {
    if (cleanup) {
      await cleanup()
    }
  }

  return extraContext
}
