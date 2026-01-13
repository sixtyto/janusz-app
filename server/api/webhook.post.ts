import type { PullRequestEvent, PullRequestReviewCommentEvent } from '@octokit/webhooks-types'
import { GitHubAction, GitHubEvent, GitHubUserType } from '#shared/types/GitHubEvents'
import { JobType } from '#shared/types/JobType'
import { ServiceType } from '#shared/types/ServiceType'
import { Webhooks } from '@octokit/webhooks'
import { checkRateLimit } from '~~/server/utils/rateLimiter'
import { useLogger } from '~~/server/utils/useLogger'

type WebhookPayload = PullRequestEvent | PullRequestReviewCommentEvent

export default defineEventHandler(async (h3event) => {
  const config = useRuntimeConfig()
  const logger = useLogger(ServiceType.webhook)

  const webhooks = new Webhooks<string>({
    secret: config.webhookSecret,
  })

  const clientIp = getRequestIP(h3event, { xForwardedFor: true }) || 'unknown'
  const signature = getHeader(h3event, 'x-hub-signature-256')
  const event = getHeader(h3event, 'x-github-event')
  const deliveryId = getHeader(h3event, 'x-github-delivery')

  const redis = getRedisClient()
  const rateLimitResult = await checkRateLimit(redis, clientIp, {
    maxRequests: 100,
    windowSeconds: 60,
    keyPrefix: 'webhook:ratelimit',
  })

  if (!rateLimitResult.allowed) {
    logger.warn('Webhook rate limit exceeded', {
      clientIp,
      resetAt: rateLimitResult.resetAt,
    })
    throw createError({
      status: 429,
      message: 'Too Many Requests',
      data: {
        resetAt: rateLimitResult.resetAt.toISOString(),
      },
    })
  }

  if (deliveryId) {
    const deliveryKey = `webhook:delivery:${deliveryId}`
    const alreadySeen = await redis.get(deliveryKey)

    if (alreadySeen) {
      logger.warn('Duplicate webhook delivery detected', {
        deliveryId,
        event,
        clientIp,
      })
      throw createError({
        status: 409,
        message: 'Duplicate delivery',
      })
    }
  }

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
    const deliveryKey = `webhook:delivery:${deliveryId}`
    await redis.setex(deliveryKey, 300, Date.now().toString())
  }
  if (event !== GitHubEvent.PULL_REQUEST && event !== GitHubEvent.PULL_REQUEST_REVIEW_COMMENT) {
    return { skipped: true, reason: 'Unsupported event' }
  }

  const parsedBody = JSON.parse(body) as WebhookPayload
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

  try {
    await getPrReviewQueue().add(jobData.type === JobType.REVIEW ? 'review-job' : 'reply-job', jobData, {
      jobId,
    })

    await jobService.createJob(jobId, installation.id, repository.full_name, pull_request.number)

    logger.info(`Enqueued ${jobData.type} job ${jobId}`, {
      jobId,
      repo: repository.full_name,
      prNumber: pull_request.number,
      action,
      installationId: installation.id,
    })
    return { status: 'queued', jobId }
  } catch (err) {
    logger.error('Failed to enqueue job', { error: err, installationId: installation?.id })
    throw createError({
      status: 500,
      message: 'Queue error',
    })
  }
})
