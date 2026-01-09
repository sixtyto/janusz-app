import type { PrReviewJobData } from '#shared/types/PrReviewJobData'
import type { ReviewComment } from '#shared/types/ReviewComment'
import type { Job } from 'bullmq'
import { CheckRunConclusion } from '#shared/types/CheckRunStatus'
import { ServiceType } from '#shared/types/ServiceType'
import { analyzePr, generatePrDescription } from '~~/server/utils/analyzePr'
import { createGitHubClient } from '~~/server/utils/createGitHubClient'
import { getLineNumberFromPatch } from '~~/server/utils/getLineNumberFromPatch'
import { parseRepositoryName } from '~~/server/utils/parseRepositoryName'
import { processRepoContext } from '~~/server/utils/repoService'
import { useLogger } from '~~/server/utils/useLogger'

const logger = useLogger(ServiceType.worker)

export async function handleReviewJob(job: Job<PrReviewJobData>) {
  const { repositoryFullName, installationId, prNumber, headSha, prBody } = job.data

  if (!repositoryFullName) {
    throw new Error('Missing repositoryFullName')
  }

  const { owner, repo } = parseRepositoryName(repositoryFullName)

  const jobId = job.id ?? 'unknown'
  logger.info(`🚀 Starting review for ${repositoryFullName}#${prNumber}`, { jobId, installationId })

  const github = createGitHubClient(installationId)
  let checkRunId: number | undefined

  try {
    checkRunId = await github.createCheckRun(owner, repo, headSha)

    const diffs = await github.getPrDiff(owner, repo, prNumber)
    if (diffs.length === 0) {
      logger.info(`ℹ️ No reviewable changes for ${repositoryFullName}#${prNumber}`, { jobId, installationId })
      await github.updateCheckRun(owner, repo, checkRunId, CheckRunConclusion.SKIPPED, {
        title: 'No Changes',
        summary: 'No reviewable changes found in this PR.',
      })
      return
    }

    try {
      if (!prBody || prBody.trim().length === 0) {
        logger.info(`📝 Generating description for ${repositoryFullName}#${prNumber}`, { jobId, installationId })
        const generatedDescription = await generatePrDescription(diffs)
        await github.updatePullRequest(owner, repo, prNumber, generatedDescription)
        logger.info(`✅ Updated PR description for ${repositoryFullName}#${prNumber}`, { jobId, installationId })
      }
    } catch (err) {
      logger.warn(`⚠️ Failed to generate/update PR description`, { error: err, jobId, installationId })
    }

    const extraContext = await processRepoContext(repositoryFullName, installationId, diffs, jobId)

    const existingSignatures = await github.getExistingReviewComments(owner, repo, prNumber)

    const reviewResult = await analyzePr(diffs, extraContext)

    const newComments: ReviewComment[] = []

    for (const comment of reviewResult.comments) {
      const targetDiff = diffs.find(d => d.filename === comment.filename)
      if (!targetDiff) {
        logger.warn(`⚠️ Skipped comment for unknown file: ${comment.filename}`, { jobId, installationId })
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
        ${targetDiff.patch}`, { jobId, installationId })
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

    logger.info(`Parsed ${reviewResult.comments.length} comments, ${newComments.length} are new.`, {
      jobId,
      installationId,
    })

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

    logger.info(`🎉 Review published for ${repositoryFullName}#${prNumber}`, { jobId, installationId })
  } catch (error) {
    logger.error(`💥 Critical error processing job ${job.id}:`, { error, jobId, installationId })

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
        logger.error('Failed to post fallback comment:', { error: fallbackError, jobId, installationId })
      }
    }

    throw error
  }
}
