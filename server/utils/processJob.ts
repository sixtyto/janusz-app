import type { Job } from 'bullmq'

const logger = createLogger('worker')

export async function processJob(job: Job<PrReviewJobData>) {
  const { repositoryFullName, installationId, prNumber, headSha } = job.data
  const [owner, repo] = repositoryFullName.split('/')

  logger.info(`🚀 Starting review for ${repositoryFullName}#${prNumber}`, { jobId: job.id })

  const github = createGitHubClient(installationId)

  try {
    const diffs = await github.getPrDiff(owner, repo, prNumber)
    if (diffs.length === 0) {
      logger.info(`ℹ️ No reviewable changes for ${repositoryFullName}#${prNumber}`, { jobId: job.id })
      return
    }

    const existingSignatures = await github.getExistingReviewComments(owner, repo, prNumber)

    const reviewResult = await analyzePr(diffs)

    const newComments: ReviewComment[] = []

    for (const comment of reviewResult.comments) {
      const targetDiff = diffs.find(d => d.filename === comment.filename)
      if (!targetDiff) {
        logger.warn(`⚠️ Skipped comment for unknown file: ${comment.filename}`, { jobId: job.id })
        continue
      }

      const lineInfo = getLineNumberFromPatch(targetDiff.patch, comment.snippet)
      if (lineInfo === null) {
        logger.warn(`⚠️ Could not find snippet in ${comment.filename}:
        ${comment.snippet}
        ---- 
        path: 
        ${targetDiff.patch}`, { jobId: job.id })
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
          body: formattedBody,
        })
      }
    }

    logger.info(`Parsed ${reviewResult.comments.length} comments, ${newComments.length} are new.`, { jobId: job.id })

    await github.postReview(
      owner,
      repo,
      prNumber,
      headSha,
      reviewResult.summary,
      newComments,
    )

    logger.info(`🎉 Review published for ${repositoryFullName}#${prNumber}`, { jobId: job.id })
  }
  catch (error) {
    logger.error(`💥 Critical error processing job ${job.id}:`, { error, jobId: job.id })

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
        logger.error('Failed to post fallback comment:', { error: fallbackError, jobId: job.id })
      }
    }

    throw error
  }
}
