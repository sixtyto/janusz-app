import type { PrReviewJobData } from '#shared/types/PrReviewJobData'
import type { Job } from 'bullmq'
import {
  GENERATED_DESCRIPTION_END_MARKER,
  GENERATED_DESCRIPTION_START_MARKER,
} from '#shared/constants/descriptionMarkers'
import { CheckRunConclusion } from '#shared/types/CheckRunStatus'
import { ServiceType } from '#shared/types/ServiceType'
import { analyzePr, generatePrDescription } from '~~/server/utils/analyzePr'
import { createGitHubClient } from '~~/server/utils/createGitHubClient'
import { createJobExecutionCollector } from '~~/server/utils/jobExecutionCollector'
import { jobService } from '~~/server/utils/jobService'

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

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const DESCRIPTION_MARKER_PATTERN = new RegExp(
  `${escapeRegex(GENERATED_DESCRIPTION_START_MARKER)}.*?${escapeRegex(GENERATED_DESCRIPTION_END_MARKER)}`,
  's',
)

function buildFinalDescription(existingBody: string | null | undefined, generatedDescription: string): string {
  if (!existingBody || existingBody.trim().length === 0) {
    return generatedDescription
  }

  return existingBody.includes(GENERATED_DESCRIPTION_START_MARKER)
    ? replaceGeneratedSection(existingBody, generatedDescription)
    : appendGeneratedDescription(existingBody, generatedDescription)
}

function replaceGeneratedSection(body: string, newDescription: string): string {
  return body.replace(DESCRIPTION_MARKER_PATTERN, newDescription)
}

function appendGeneratedDescription(body: string, description: string): string {
  return `${body}\n\n${description}`
}

export async function handleReviewJob(job: Job<PrReviewJobData>) {
  const { repositoryFullName, installationId, prNumber, headSha, prBody } = job.data

  if (!repositoryFullName) {
    throw new Error('Missing repositoryFullName')
  }

  const { owner, repo } = parseRepositoryName(repositoryFullName)

  const repoSettings = await getRepositorySettings(installationId, repositoryFullName)

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

    const collector = createJobExecutionCollector({
      preferredModel: repoSettings.preferredModel,
      executionMode: repoSettings.agentExecutionMode,
      filesAnalyzed: filteredDiffs.length,
    })

    try {
      logger.info(`📝 Generating description for ${repositoryFullName}#${prNumber}`)
      const generatedDescription = await generatePrDescription(
        filteredDiffs,
        repoSettings.customPrompts.descriptionPrompt,
        collector,
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
      collector,
    )

    const existingSignatures = await github.getExistingReviewComments(owner, repo, prNumber)

    const reviewResult = await analyzePr(
      filteredDiffs,
      extraContext,
      {
        preferredModel: repoSettings.preferredModel,
        agentExecutionMode: repoSettings.agentExecutionMode,
        collector,
      },
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

    collector.setCommentStats(
      reviewResult.totalRawComments,
      reviewResult.totalMergedComments,
      newComments.length,
    )

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
      conclusion = CheckRunConclusion.NEUTRAL
    }

    const annotations = createAnnotations(newComments)

    await github.updateCheckRun(owner, repo, checkRunId, conclusion, {
      title: 'Janusz Review Completed',
      summary: `### 🏁 Review Summary\n\n- **Critical Issues:** ${criticalCount}\n- **High:** ${highCount}\n- **Medium:** ${mediumCount}\n- **Low:** ${lowCount}\n\n${reviewResult.summary}`,
      annotations,
    })

    try {
      const executionHistory = collector.finalize()
      if (job.id) {
        await jobService.updateJobExecutionHistory(job.id, executionHistory)
      }
    } catch (historyError) {
      logger.warn('⚠️ Failed to save execution history, continuing...', { error: historyError })
    }

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
