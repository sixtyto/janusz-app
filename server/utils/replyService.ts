import type { PrReviewJobData } from '#shared/types/PrReviewJobData'
import type { Job } from 'bullmq'
import { ServiceType } from '#shared/types/ServiceType'
import { analyzeReply } from '~~/server/utils/analyzePr'
import { createGitHubClient } from '~~/server/utils/createGitHubClient'
import { parseRepositoryName } from '~~/server/utils/parseRepositoryName'
import { useLogger } from '~~/server/utils/useLogger'

const logger = useLogger(ServiceType.worker)

export async function handleReplyJob(job: Job<PrReviewJobData>) {
  const { repositoryFullName, installationId, prNumber, commentId } = job.data
  const jobId = job.id ?? 'unknown'

  if (!commentId) {
    throw new Error('Missing commentId for reply job')
  }

  const { owner, repo } = parseRepositoryName(repositoryFullName)
  const github = createGitHubClient(installationId)

  try {
    logger.info(`🧵 Checking thread for comment ${commentId} in ${repositoryFullName}#${prNumber}`, {
      jobId,
      installationId,
    })

    const botUser = await github.getBotUser()
    if (!botUser) {
      throw new Error('Could not fetch bot user information')
    }
    const januszLogin = `${botUser.slug}[bot]`

    const allComments = await github.listReviewCommentsForPr(owner, repo, prNumber)
    const targetComment = allComments.find(comment => comment.id === commentId)

    if (!targetComment) {
      logger.warn(`⚠️ Comment ${commentId} not found`, { jobId, installationId })
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
      logger.info(`ℹ️ Skipping: Thread was not started by Janusz (started by ${rootComment.user.login})`, {
        jobId,
        installationId,
      })
      return
    }

    try {
      await github.createReactionForReviewComment(owner, repo, commentId, 'eyes')
    } catch (err) {
      logger.warn(`⚠️ Failed to add reaction to comment ${commentId}`, { error: err, jobId, installationId })
    }

    logger.info(`🤖 Janusz is preparing a response for thread ${rootComment.id}`, { jobId, installationId })

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

    logger.info(`✅ Replied to comment ${commentId}`, { jobId, installationId })
  } catch (error) {
    logger.error(`💥 Failed to process reply job ${job.id}:`, { error, jobId, installationId })
    throw error
  }
}
