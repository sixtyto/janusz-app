import type { PrReviewJobData } from '#shared/types/PrReviewJobData'
import type { Job } from 'bullmq'
import { CheckRunConclusion } from '#shared/types/CheckRunStatus'
import { ServiceType } from '#shared/types/ServiceType'
import { analyzePr, generatePrDescription } from '~~/server/utils/analyzePr'
import { createGitHubClient } from '~~/server/utils/createGitHubClient'
import {
  GENERATED_DESCRIPTION_END_MARKER,
  GENERATED_DESCRIPTION_START_MARKER,
} from '~~/server/utils/januszPrompts'
import { parseRepositoryName } from '~~/server/utils/parseRepositoryName'
import { processRepoContext } from '~~/server/utils/repoService'
import {
  getRepositorySettings,
  meetsSeverityThreshold,
  shouldExcludeFile,
} from '~~/server/utils/repositorySettingsService'
import { createAnnotations, prepareReviewComments } from '~~/server/utils/reviewFormatter'
import { useLogger } from '~~/server/utils/useLogger'

const logger = useLogger(ServiceType.worker)

function buildFinalDescription(existingBody: string | null | undefined, generatedDescription: string): string {
  const hasGeneratedSection = existingBody?.includes(GENERATED_DESCRIPTION_START_MARKER)

  if (hasGeneratedSection) {
    const markerPattern = new RegExp(
      `${escapeRegex(GENERATED_DESCRIPTION_START_MARKER)}[\\s\\S]*?${escapeRegex(GENERATED_DESCRIPTION_END_MARKER)}`,
    )
    return existingBody!.replace(markerPattern, generatedDescription)
  }

  if (!existingBody || existingBody.trim().length === 0) {
    return generatedDescription
  }

  return `${existingBody}\n\n${generatedDescription}`
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function handleReviewJob(job: Job<PrReviewJobData>) {
  const { repositoryFullName, installationId, prNumber, headSha, prBody } = job.data

  if (!repositoryFullName) {
    throw new Error('Missing repositoryFullName')
  }

  const { owner, repo } = parseRepositoryName(repositoryFullName)

  // Fetch repository settings
  const repoSettings = await getRepositorySettings(installationId, repositoryFullName)

  // Check if reviews are enabled for this repository
  if (!repoSettings.enabled) {
    logger.info(`⏭️ Reviews disabled for ${repositoryFullName}#${prNumber}`)
    const github = createGitHubClient(installationId)
    const checkRunId = await github.createCheckRun(owner, repo, headSha)
    await github.updateCheckRun(owner, repo, checkRunId, CheckRunConclusion.SKIPPED, {
      title: 'Reviews Disabled',
      summary: 'Automated reviews are disabled for this repository.',
    })
    return
  }

  logger.info(`🚀 Starting review for ${repositoryFullName}#${prNumber}`)

  const github = createGitHubClient(installationId)
  let checkRunId: number | undefined

  try {
    checkRunId = await github.createCheckRun(owner, repo, headSha)

    const diffs = await github.getPrDiff(owner, repo, prNumber)

    const filteredDiffs = diffs.filter(diff =>
      !shouldExcludeFile(diff.filename, repoSettings.excludedPatterns),
    )

    if (filteredDiffs.length === 0) {
      logger.info(`ℹ️ No reviewable changes for ${repositoryFullName}#${prNumber}`)
      await github.updateCheckRun(owner, repo, checkRunId, CheckRunConclusion.SKIPPED, {
        title: 'No Changes',
        summary: 'No reviewable changes found in this PR (all files excluded).',
      })
      return
    }

    try {
      logger.info(`📝 Generating description for ${repositoryFullName}#${prNumber}`)
      const generatedDescription = await generatePrDescription(
        filteredDiffs,
        repoSettings.customPrompts.descriptionPrompt,
      )
      const newBody = buildFinalDescription(prBody, generatedDescription)
      if (newBody !== prBody) {
        await github.updatePullRequest(owner, repo, prNumber, newBody)
        logger.info(`✅ Updated PR description for ${repositoryFullName}#${prNumber}`)
      }
    } catch (err) {
      logger.warn(`⚠️ Failed to generate/update PR description`, { error: err })
    }

    const extraContext = await processRepoContext(
      repositoryFullName,
      installationId,
      filteredDiffs,
      repoSettings.customPrompts.contextSelectionPrompt,
    )

    const existingSignatures = await github.getExistingReviewComments(owner, repo, prNumber)

    const reviewResult = await analyzePr(
      filteredDiffs,
      extraContext,
      repoSettings.customPrompts.reviewPrompt,
      repoSettings.preferredModel,
    )

    const filteredComments = reviewResult.comments.filter(comment =>
      meetsSeverityThreshold(comment.severity, repoSettings.severityThreshold),
    )

    const severityCounts = reviewResult.comments.reduce(
      (acc, comment) => {
        acc[comment.severity] = (acc[comment.severity] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    const newComments = prepareReviewComments(filteredDiffs, filteredComments, existingSignatures)

    logger.info(`Parsed ${reviewResult.comments.length} comments, ${newComments.length} are new.`)

    await github.postReview(
      owner,
      repo,
      prNumber,
      headSha,
      reviewResult.summary,
      newComments,
    )

    const criticalCount = severityCounts.CRITICAL || 0
    const highCount = severityCounts.HIGH || 0
    const mediumCount = severityCounts.MEDIUM || 0
    const lowCount = severityCounts.LOW || 0

    let conclusion: CheckRunConclusion = CheckRunConclusion.SUCCESS
    if (criticalCount > 0) {
      // TODO: consider changing it to 'failure' after adding replies to comments
      conclusion = CheckRunConclusion.NEUTRAL
    }

    const annotations = createAnnotations(newComments)

    await github.updateCheckRun(owner, repo, checkRunId, conclusion, {
      title: 'Janusz Review Completed',
      summary: `### 🏁 Review Summary\n\n- **Critical Issues:** ${criticalCount}\n- **High:** ${highCount}\n- **Medium:** ${mediumCount}\n- **Low:** ${lowCount}\n\n${reviewResult.summary}`,
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
