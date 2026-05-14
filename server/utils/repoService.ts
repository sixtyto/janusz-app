import type { JobExecutionCollector } from '~~/server/utils/jobExecutionCollector'
import type { FileDiff } from '#shared/types/FileDiff'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createGitHubClient } from '~~/server/utils/createGitHubClient'
import { provisionRepo } from '~~/server/utils/provisionRepo'
import { selectContextFiles } from '~~/server/utils/selectContextFiles'
import { useLogger } from '~~/server/utils/useLogger'
import { Limits } from '#shared/constants/limits'
import { ServiceType } from '#shared/types/ServiceType'

const logger = useLogger(ServiceType.worker)

export async function processRepoContext(
  repositoryFullName: string,
  installationId: number,
  diffs: FileDiff[],
  customContextSelectionPrompt?: string,
  collector?: JobExecutionCollector,
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

    const suggestedFiles = await selectContextFiles(index, diffs, customContextSelectionPrompt, collector)
    logger.info(`🤖 Maciej suggested ${suggestedFiles.length} files`, { suggestedFiles })

    const diffFiles = new Set(diffs.map(d => d.filename))
    const filesToRead = new Set(suggestedFiles.filter(f => !diffFiles.has(f)))

    const readPromises = Array.from(filesToRead).map(async (file) => {
      const fullPath = path.resolve(repoDir, file)
      if (!fullPath.startsWith(repoDir + path.sep) && fullPath !== repoDir) {
        logger.error(`🚨 SECURITY: Path traversal attempt blocked`, {
          file,
          resolvedPath: fullPath,
          repoDir,
        })
        return null
      }

      try {
        const stat = await fs.lstat(fullPath)
        if (stat.isSymbolicLink()) {
          logger.info(`⏭️ Skipping symlink: ${file}`)
          return null
        }
        if (stat.isDirectory()) {
          logger.info(`⏭️ Skipping directory: ${file}`)
          return null
        }
        if (stat.size > Limits.MAX_FILE_SIZE_BYTES) {
          logger.warn(`⏭️ Skipping large file (>500KB): ${file} (${stat.size} bytes)`)
          return null
        }

        const content = await fs.readFile(fullPath, 'utf-8')
        logger.info(`📄 Added context file: ${file}`)
        return { file, content }
      } catch (error) {
        logger.warn(`⚠️ Failed to read context file: ${file}`, { error })
        return null
      }
    })

    const results = await Promise.allSettled(readPromises)
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        extraContext[result.value.file] = result.value.content
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
