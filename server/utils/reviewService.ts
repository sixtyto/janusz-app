import type { PrReviewJobData } from '#shared/types/PrReviewJobData'
import type { Job } from 'bullmq'
import { CheckRunConclusion } from '#shared/types/CheckRunStatus'
import { ServiceType } from '#shared/types/ServiceType'
import { analyzePr, generatePrDescription } from '~~/server/utils/analyzePr'
import { createGitHubClient } from '~~/server/utils/createGitHubClient'
import { parseRepositoryName } from '~~/server/utils/parseRepositoryName'
import { processRepoContext } from '~~/server/utils/repoService'
import { createAnnotations, prepareReviewComments } from '~~/server/utils/reviewFormatter'
import { useLogger } from '~~/server/utils/useLogger'

const logger = useLogger(ServiceType.worker)

export async function handleReviewJob(job: Job<PrReviewJobData>) {
  const { repositoryFullName, installationId, prNumber, headSha, prBody } = job.data

  if (!repositoryFullName) {
    throw new Error('Missing repositoryFullName')
  }

  const { owner, repo } = parseRepositoryName(repositoryFullName)

  logger.info(`🚀 Starting review for ${repositoryFullName}#${prNumber}`)

  const github = createGitHubClient(installationId)
  let checkRunId: number | undefined

  try {
    checkRunId = await github.createCheckRun(owner, repo, headSha)

    const diffs = await github.getPrDiff(owner, repo, prNumber)
    if (diffs.length === 0) {
      logger.info(`ℹ️ No reviewable changes for ${repositoryFullName}#${prNumber}`)
      await github.updateCheckRun(owner, repo, checkRunId, CheckRunConclusion.SKIPPED, {
        title: 'No Changes',
        summary: 'No reviewable changes found in this PR.',
      })
      return
    }

    try {
      if (!prBody || prBody.trim().length === 0) {
        logger.info(`📝 Generating description for ${repositoryFullName}#${prNumber}`)
        const generatedDescription = await generatePrDescription(diffs)
        await github.updatePullRequest(owner, repo, prNumber, generatedDescription)
        logger.info(`✅ Updated PR description for ${repositoryFullName}#${prNumber}`)
      }
    } catch (err) {
      logger.warn(`⚠️ Failed to generate/update PR description`, { error: err })
    }

    const extraContext = await processRepoContext(repositoryFullName, installationId, diffs)

    const existingSignatures = await github.getExistingReviewComments(owner, repo, prNumber)

    const reviewResult = await analyzePr(diffs, extraContext)

    const newComments = prepareReviewComments(diffs, reviewResult.comments, existingSignatures)

    logger.info(`Parsed ${reviewResult.comments.length} comments, ${newComments.length} are new.`)

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

    const annotations = createAnnotations(newComments)

    await github.updateCheckRun(owner, repo, checkRunId, conclusion, {
      title: 'Janusz Review Completed',
      summary: `### 🏁 Review Summary\n\n- **Critical Issues:** ${criticalCount}\n- **Warnings:** ${warningCount}\n\n${reviewResult.summary}`,
      annotations,
    })

    logger.info(`🎉 Review published for ${repositoryFullName}#${prNumber}`)
  } catch (error) {
    logger.error(`💥 Critical error processing job ${job.id}:`, { error })

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
        logger.error('Failed to post fallback comment:', { error: fallbackError })
      }
    }

    throw error
  }
}
