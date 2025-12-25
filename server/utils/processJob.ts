import type { Job } from 'bullmq'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { ServiceType } from '#shared/types/ServiceType'
import { provisionRepo } from '~~/server/utils/provisionRepo'
import { selectContextFiles } from '~~/server/utils/selectContextFiles'

const logger = createLogger(ServiceType.worker)

export async function processJob(job: Job<PrReviewJobData>) {
  const { repositoryFullName, installationId, prNumber, headSha } = job.data

  if (!repositoryFullName) {
    throw new Error('Missing repositoryFullName')
  }

  const [owner, repo] = repositoryFullName.split('/')
  if (!owner || !repo) {
    throw new Error(`Invalid repositoryFullName: ${repositoryFullName}`)
  }

  const jobId = job.id || 'unknown'
  logger.info(`🚀 Starting review for ${repositoryFullName}#${prNumber}`, { jobId })

  const github = createGitHubClient(installationId)
  let checkRunId: number | undefined

  try {
    checkRunId = await github.createCheckRun(owner, repo, headSha)

    const diffs = await github.getPrDiff(owner, repo, prNumber)
    if (diffs.length === 0) {
      logger.info(`ℹ️ No reviewable changes for ${repositoryFullName}#${prNumber}`, { jobId })
      await github.updateCheckRun(owner, repo, checkRunId, 'skipped', {
        title: 'No Changes',
        summary: 'No reviewable changes found in this PR.',
      })
      return
    }

    const extraContext: Record<string, string> = {}
    let cleanup: (() => Promise<void>) | undefined

    try {
      logger.info(`🧠 Enhancing context for ${repositoryFullName}#${prNumber}`, { jobId })
      const token = await github.getToken()
      const cloneUrl = `https://x-access-token:${token}@github.com/${repositoryFullName}.git`

      const { index, repoDir, cleanup: cleanupFn } = await provisionRepo(repositoryFullName, cloneUrl, jobId)
      cleanup = cleanupFn

      const suggestedFiles = await selectContextFiles(index, diffs)
      logger.info(`🤖 Maciej suggested ${suggestedFiles.length} files`, { jobId, suggestedFiles })

      const diffFiles = new Set(diffs.map(d => d.filename))
      const filesToRead = new Set(suggestedFiles.filter(f => !diffFiles.has(f)))

      for (const file of filesToRead) {
        const fullPath = path.resolve(repoDir, file)
        if (!fullPath.startsWith(repoDir)) {
          logger.warn(`🚫 Potential path traversal attempt blocked: ${file}`, { jobId })
          continue
        }

        try {
          const stat = await fs.lstat(fullPath)
          if (stat.isSymbolicLink()) {
            logger.info(`⏭️ Skipping symlink: ${file}`, { jobId })
            continue
          }
          if (stat.isDirectory()) {
            logger.info(`⏭️ Skipping directory: ${file}`, { jobId })
            continue
          }
          if (stat.size > 500 * 1024) {
            logger.warn(`⏭️ Skipping large file (>500KB): ${file} (${stat.size} bytes)`, { jobId })
            continue
          }

          extraContext[file] = await fs.readFile(fullPath, 'utf-8')
          logger.info(`📄 Added context file: ${file}`, { jobId })
        }
        catch (err) {
          logger.warn(`⚠️ Failed to read context file: ${file}`, { error: err, jobId })
        }
      }
    }
    catch (error) {
      logger.error('⚠️ Failed to enhance context, proceeding with basic diff', { error, jobId })
    }
    finally {
      if (cleanup) {
        await cleanup()
      }
    }

    const existingSignatures = await github.getExistingReviewComments(owner, repo, prNumber)

    const reviewResult = await analyzePr(diffs, extraContext)

    const newComments: ReviewComment[] = []

    for (const comment of reviewResult.comments) {
      const targetDiff = diffs.find(d => d.filename === comment.filename)
      if (!targetDiff) {
        logger.warn(`⚠️ Skipped comment for unknown file: ${comment.filename}`, { jobId })
        continue
      }

      if (!targetDiff.patch) {
        continue
      }

      const lineInfo = getLineNumberFromPatch(targetDiff.patch, comment.snippet)
      if (lineInfo === null) {
        logger.warn(`⚠️ Could not find snippet in ${comment.filename}:
        ${comment.snippet}
        ---- 
        path: 
        ${targetDiff.patch}`, { jobId })
        continue
      }

      const icon = comment.severity === 'CRITICAL' ? '🚫' : comment.severity === 'WARNING' ? '⚠️' : 'ℹ️'
      let formattedBody = `${icon} **[${comment.severity}]** ${comment.body}`

      if (comment.suggestion) {
        formattedBody += `\n\n\`\`\`suggestion\n${comment.suggestion}\n\`\`\``
      }

      const signature = `${comment.filename}:${lineInfo.line}:${formattedBody.trim()}`
      if (!existingSignatures.has(signature)) {
        newComments.push({
          ...comment,
          line: lineInfo.line,
          start_line: lineInfo.start_line,
          side: lineInfo.side,
          body: formattedBody,
        })
      }
    }

    logger.info(`Parsed ${reviewResult.comments.length} comments, ${newComments.length} are new.`, { jobId })

    await github.postReview(
      owner,
      repo,
      prNumber,
      headSha,
      reviewResult.summary,
      newComments,
    )

    const criticalCount = reviewResult.comments.filter(c => c.severity === 'CRITICAL').length
    const warningCount = reviewResult.comments.filter(c => c.severity === 'WARNING').length

    let conclusion: 'success' | 'failure' | 'neutral' = 'success'
    if (criticalCount > 0)
      // TODO: consider changing it to 'failure' after adding replies to comments
      conclusion = 'neutral'

    const annotations = newComments.map((comment) => {
      let annotationLevel: 'notice' | 'warning' | 'failure' = 'notice'
      if (comment.severity === 'CRITICAL')
        annotationLevel = 'failure'
      else if (comment.severity === 'WARNING')
        annotationLevel = 'warning'

      return {
        path: comment.filename,
        start_line: comment.start_line ?? comment.line ?? 1,
        end_line: comment.line ?? comment.start_line ?? 1,
        annotation_level: annotationLevel,
        message: comment.body,
        title: `[${comment.severity}] ${comment.body.slice(0, 50)}...`,
      }
    })

    await github.updateCheckRun(owner, repo, checkRunId, conclusion, {
      title: 'Janusz Review Completed',
      summary: `### 🏁 Review Summary\n\n- **Critical Issues:** ${criticalCount}\n- **Warnings:** ${warningCount}\n\n${reviewResult.summary}`,
      annotations,
    })

    logger.info(`🎉 Review published for ${repositoryFullName}#${prNumber}`, { jobId })
  }
  catch (error) {
    logger.error(`💥 Critical error processing job ${job.id}:`, { error, jobId })

    if (checkRunId) {
      await github.updateCheckRun(owner, repo, checkRunId, 'failure', {
        title: 'Janusz Crashed',
        summary: 'Janusz encountered an internal error while processing this review.\n\nSee logs for details.',
      })
    }

    const isFinalAttempt = job.attemptsMade >= (job.opts.attempts || 3)

    if (isFinalAttempt) {
      try {
        await github.postFallbackComment(
          owner,
          repo,
          prNumber,
          '⚠️ Janusz could not complete the AI review due to an internal error. Please try again later.',
        )
      }
      catch (fallbackError) {
        logger.error('Failed to post fallback comment:', { error: fallbackError, jobId })
      }
    }

    throw error
  }
}
