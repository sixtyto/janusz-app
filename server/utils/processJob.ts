import type { PrReviewJobData } from '#shared/types/PrReviewJobData'
import type { ReviewComment } from '#shared/types/ReviewComment'
import type { Job } from 'bullmq'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { CheckRunConclusion } from '#shared/types/CheckRunStatus'
import { JobType } from '#shared/types/JobType'
import { ServiceType } from '#shared/types/ServiceType'
import { analyzePr, analyzeReply, generatePrDescription } from '~~/server/utils/analyzePr'
import { createGitHubClient } from '~~/server/utils/createGitHubClient'
import { createLogger } from '~~/server/utils/createLogger'
import { getLineNumberFromPatch } from '~~/server/utils/getLineNumberFromPatch'
import { parseRepositoryName } from '~~/server/utils/parseRepositoryName'
import { provisionRepo } from '~~/server/utils/provisionRepo'
import { selectContextFiles } from '~~/server/utils/selectContextFiles'

const logger = createLogger(ServiceType.worker)

export async function processJob(job: Job<PrReviewJobData>) {
  const { type } = job.data

  if (type === JobType.REPLY) {
    await handleReply(job)
    return
  }

  await handleReview(job)
}

async function handleReply(job: Job<PrReviewJobData>) {
  const { repositoryFullName, installationId, prNumber, commentId } = job.data
  const jobId = job.id ?? 'unknown'

  if (!commentId) {
    throw new Error('Missing commentId for reply job')
  }

  const { owner, repo } = parseRepositoryName(repositoryFullName)
  const github = createGitHubClient(installationId)

  try {
    logger.info(`🧵 Checking thread for comment ${commentId} in ${repositoryFullName}#${prNumber}`, { jobId })

    const botUser = await github.getBotUser()
    if (!botUser) {
      throw new Error('Could not fetch bot user information')
    }
    const januszLogin = `${botUser.slug}[bot]`

    const allComments = await github.listReviewCommentsForPr(owner, repo, prNumber)
    const targetComment = allComments.find(comment => comment.id === commentId)

    if (!targetComment) {
      logger.warn(`⚠️ Comment ${commentId} not found`, { jobId })
      return
    }

    const commentsMap = new Map(allComments.map(comment => [comment.id, comment]))
    const thread: typeof allComments = []
    let current: typeof targetComment | undefined = targetComment

    while (current) {
      thread.unshift(current)
      current = current.in_reply_to_id ? commentsMap.get(current.in_reply_to_id) : undefined
    }

    const rootComment = thread[0]
    if (rootComment === undefined) {
      throw new Error('Empty thread')
    }
    if (rootComment.user.login !== januszLogin) {
      logger.info(`ℹ️ Skipping: Thread was not started by Janusz (started by ${rootComment.user.login})`, { jobId })
      return
    }

    try {
      await github.createReactionForReviewComment(owner, repo, commentId, 'eyes')
    } catch (err) {
      logger.warn(`⚠️ Failed to add reaction to comment ${commentId}`, { error: err, jobId })
    }

    logger.info(`🤖 Janusz is preparing a response for thread ${rootComment.id}`, { jobId })

    const history = thread.map(comment => ({
      author: comment.user.login === januszLogin ? 'janusz' : comment.user.login,
      body: comment.body,
    }))

    const diffs = await github.getPrDiff(owner, repo, prNumber)
    const fileDiff = diffs.find(d => d.filename === targetComment.path)

    const replyBody = await analyzeReply(
      history,
      targetComment.path,
      fileDiff?.patch ?? 'Diff context not available',
    )

    await github.createReplyForReviewComment(
      owner,
      repo,
      prNumber,
      commentId,
      replyBody,
    )

    logger.info(`✅ Replied to comment ${commentId}`, { jobId })
  } catch (error) {
    logger.error(`💥 Failed to process reply job ${job.id}:`, { error, jobId })
    throw error
  }
}

async function handleReview(job: Job<PrReviewJobData>) {
  const { repositoryFullName, installationId, prNumber, headSha, prBody } = job.data

  if (!repositoryFullName) {
    throw new Error('Missing repositoryFullName')
  }

  const { owner, repo } = parseRepositoryName(repositoryFullName)

  const jobId = job.id ?? 'unknown'
  logger.info(`🚀 Starting review for ${repositoryFullName}#${prNumber}`, { jobId })

  const github = createGitHubClient(installationId)
  let checkRunId: number | undefined

  try {
    checkRunId = await github.createCheckRun(owner, repo, headSha)

    const diffs = await github.getPrDiff(owner, repo, prNumber)
    if (diffs.length === 0) {
      logger.info(`ℹ️ No reviewable changes for ${repositoryFullName}#${prNumber}`, { jobId })
      await github.updateCheckRun(owner, repo, checkRunId, CheckRunConclusion.SKIPPED, {
        title: 'No Changes',
        summary: 'No reviewable changes found in this PR.',
      })
      return
    }

    try {
      if (!prBody || prBody.trim().length === 0) {
        logger.info(`📝 Generating description for ${repositoryFullName}#${prNumber}`, { jobId })
        const generatedDescription = await generatePrDescription(diffs)
        await github.updatePullRequest(owner, repo, prNumber, generatedDescription)
        logger.info(`✅ Updated PR description for ${repositoryFullName}#${prNumber}`, { jobId })
      }
    } catch (err) {
      logger.warn(`⚠️ Failed to generate/update PR description`, { error: err, jobId })
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
        } catch (err) {
          logger.warn(`⚠️ Failed to read context file: ${file}`, { error: err, jobId })
        }
      }
    } catch (error) {
      logger.error('⚠️ Failed to enhance context, proceeding with basic diff', { error, jobId })
    } finally {
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

    const criticalCount = reviewResult.comments.filter(comment => comment.severity === 'CRITICAL').length
    const warningCount = reviewResult.comments.filter(comment => comment.severity === 'WARNING').length

    let conclusion: CheckRunConclusion = CheckRunConclusion.SUCCESS
    if (criticalCount > 0) {
      // TODO: consider changing it to 'failure' after adding replies to comments
      conclusion = CheckRunConclusion.NEUTRAL
    }

    const annotations = newComments.map((comment) => {
      let annotationLevel: 'notice' | 'warning' | 'failure' = 'notice'
      if (comment.severity === 'CRITICAL') {
        annotationLevel = 'failure'
      } else if (comment.severity === 'WARNING') {
        annotationLevel = 'warning'
      }

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
  } catch (error) {
    logger.error(`💥 Critical error processing job ${job.id}:`, { error, jobId })

    if (checkRunId) {
      await github.updateCheckRun(owner, repo, checkRunId, CheckRunConclusion.FAILURE, {
        title: 'Janusz Crashed',
        summary: 'Janusz encountered an internal error while processing this review.\n\nSee logs for details.',
      })
    }

    const isFinalAttempt = job.attemptsMade >= (job.opts.attempts ?? 3)

    if (isFinalAttempt) {
      try {
        await github.postFallbackComment(
          owner,
          repo,
          prNumber,
          '⚠️ Janusz could not complete the AI review due to an internal error. Please try again later.',
        )
      } catch (fallbackError) {
        logger.error('Failed to post fallback comment:', { error: fallbackError, jobId })
      }
    }

    throw error
  }
}
