import type { PullRequestEvent, PullRequestReviewCommentEvent } from '@octokit/webhooks-types'
import { RedisKeys } from '#shared/constants/redisKeys'
import { GitHubAction, GitHubEvent, GitHubUserType } from '#shared/types/GitHubEvents'
import { JobType } from '#shared/types/JobType'
import { ServiceType } from '#shared/types/ServiceType'
import { Webhooks } from '@octokit/webhooks'
import { eq } from 'drizzle-orm'
import { jobs } from '~~/server/database/schema'
import { getRedisClient } from '~~/server/utils/getRedisClient'
import { useRateLimiter } from '~~/server/utils/rateLimiter'
import { useDatabase } from '~~/server/utils/useDatabase'
import { useLogger } from '~~/server/utils/useLogger'

type WebhookPayload = PullRequestEvent | PullRequestReviewCommentEvent

export default defineEventHandler(async (h3event) => {
  const config = useRuntimeConfig()
  const logger = useLogger(ServiceType.webhook)

  const webhooks = new Webhooks<string>({
    secret: config.webhookSecret,
  })

  await useRateLimiter(h3event, { maxRequests: 100, useIpOnly: true })

  const signature = getHeader(h3event, 'x-hub-signature-256')
  const event = getHeader(h3event, 'x-github-event')
  const deliveryId = getHeader(h3event, 'x-github-delivery')

  const redis = getRedisClient()
  const body = await readRawBody(h3event)

  if (!body || !signature) {
    throw createError({ status: 400, message: 'Missing body or signature' })
  }

  const isValid = await webhooks.verify(body, signature)
  if (!isValid) {
    logger.warn('Webhook signature verification failed', {
      deliveryId,
      event,
      signatureProvided: !!signature,
      bodyLength: body.length,
    })
    throw createError({ status: 401, message: 'Unauthorized' })
  }

  if (deliveryId) {
    const deliveryKey = RedisKeys.WEBHOOK_DELIVERY(deliveryId)
    const isNew = await redis.set(deliveryKey, Date.now().toString(), 'EX', 300, 'NX')
    if (!isNew) {
      throw createError({
        status: 409,
        message: 'Duplicate delivery',
      })
    }
  }
  if (event !== GitHubEvent.PULL_REQUEST && event !== GitHubEvent.PULL_REQUEST_REVIEW_COMMENT) {
    return { skipped: true, reason: 'Unsupported event' }
  }

  let parsedBody: WebhookPayload
  try {
    parsedBody = JSON.parse(body) as WebhookPayload
  } catch {
    throw createError({ status: 400, message: 'Invalid JSON payload' })
  }
  const { action, pull_request, repository, installation, sender } = parsedBody
  const comment = 'comment' in parsedBody ? parsedBody.comment : undefined

  logger.info('Webhook received', {
    event,
    action,
    deliveryId,
    repo: repository?.full_name,
    installationId: installation?.id,
  })

  if (sender?.type === GitHubUserType.BOT || sender?.login?.includes('[bot]')) {
    logger.info('Ignoring bot event', {
      event,
      action,
      user: sender.login,
      deliveryId,
      installationId: installation?.id,
    })
    return { status: 'ignored', reason: 'bot_event' }
  }

  if (event === GitHubEvent.PULL_REQUEST) {
    if (action !== GitHubAction.OPENED && action !== GitHubAction.SYNCHRONIZE) {
      return { status: 'ignored', reason: 'action_type' }
    }

    if (pull_request?.user?.type === GitHubUserType.BOT || pull_request?.user?.login?.includes('[bot]')) {
      logger.info('Ignoring bot PR', {
        prNumber: pull_request.number,
        user: pull_request.user.login,
        deliveryId,
        installationId: installation?.id,
      })
      return { status: 'ignored', reason: 'bot_pr' }
    }
  } else if (event === GitHubEvent.PULL_REQUEST_REVIEW_COMMENT) {
    if (action !== GitHubAction.CREATED) {
      return { status: 'ignored', reason: 'action_type' }
    }
  } else {
    return { status: 'ignored', reason: 'event_type' }
  }

  if (!pull_request || !repository || !installation) {
    logger.warn('Missing required payload fields', {
      hasPullRequest: !!pull_request,
      hasRepo: !!repository,
      hasInstallation: !!installation,
      deliveryId,
      installationId: installation?.id,
    })

    throw createError({
      status: 400,
      message: 'Invalid payload',
    })
  }

  const jobData: PrReviewJobData = {
    repositoryFullName: repository.full_name,
    installationId: installation.id,
    prNumber: pull_request.number,
    headSha: pull_request.head.sha,
    action: action as GitHubAction,
    type: event === GitHubEvent.PULL_REQUEST ? JobType.REVIEW : JobType.REPLY,
    commentId: comment?.id,
    prBody: pull_request.body ?? undefined,
  }

  const jobId = event === GitHubEvent.PULL_REQUEST
    ? `${repository.full_name}-${pull_request.number}-${pull_request.head.sha}`
    : `${repository.full_name}-${pull_request.number}-comment${comment ? `-${comment.id}` : ''}`

  let wasInserted = false
  try {
    wasInserted = await jobService.createJob(jobId, installation.id, repository.full_name, pull_request.number)
  } catch (error) {
    logger.error('Failed to create job in DB', { error, jobId, installationId: installation.id })
    throw createError({
      status: 500,
      message: 'Database error',
    })
  }

  try {
    await getPrReviewQueue().add(jobData.type === JobType.REVIEW ? 'review-job' : 'reply-job', jobData, {
      jobId,
    })

    logger.info(`Enqueued ${jobData.type} job ${jobId}`, {
      jobId,
      repo: repository.full_name,
      prNumber: pull_request.number,
      action,
      installationId: installation.id,
    })
    return { status: 'queued', jobId }
  } catch (err) {
    if (wasInserted) {
      try {
        const database = useDatabase()
        await database.delete(jobs).where(eq(jobs.id, jobId))
      } catch (error) {
        logger.error('Failed to rollback job creation', { error, jobId, installationId: installation.id })
      }
    }

    logger.error('Failed to enqueue job', { error: err, installationId: installation.id })
    throw createError({
      status: 500,
      message: 'Queue error',
    })
  }
})
