import { GitHubAction, GitHubEvent, GitHubUserType } from '#shared/types/GitHubEvents'
import { JobType } from '#shared/types/JobType'
import { ServiceType } from '#shared/types/ServiceType'
import { Webhooks } from '@octokit/webhooks'

export default defineEventHandler(async (h3event) => {
  const config = useRuntimeConfig()
  const logger = createLogger(ServiceType.webhook)

  const webhooks = new Webhooks<string>({
    secret: config.webhookSecret,
  })

  const body = await readRawBody(h3event)

  const signature = getHeader(h3event, 'x-hub-signature-256')

  if (!body || !signature) {
    throw createError({ status: 400, message: 'Missing body or signature' })
  }

  const isValid = await webhooks.verify(body, signature)
  if (!isValid) {
    logger.warn(`Auth failed: ${body}`)
    throw createError({ status: 401, message: 'Unauthorized' })
  }

  const payload = JSON.parse(body)
  const event = getHeader(h3event, 'x-github-event')
  const deliveryId = getHeader(h3event, 'x-github-delivery')
  const { action, pull_request, repository, installation, comment } = payload

  logger.info('Webhook received', {
    event,
    action,
    deliveryId,
    repo: repository?.full_name,
    installationId: installation?.id,
  })

  const sender = payload.sender
  if (sender?.type === GitHubUserType.BOT || sender?.login?.includes('[bot]')) {
    logger.info('Ignoring bot event', {
      event,
      action,
      user: sender.login,
      deliveryId,
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
    action: action as any,
    type: event === GitHubEvent.PULL_REQUEST ? JobType.REVIEW : JobType.REPLY,
    commentId: comment?.id,
  }

  const jobId = event === GitHubEvent.PULL_REQUEST
    ? `${repository.full_name}-${pull_request.number}-${pull_request.head.sha}`
    : `${repository.full_name}-${pull_request.number}-comment-${comment.id}`

  try {
    await getPrReviewQueue().add(jobData.type === JobType.REVIEW ? 'review-job' : 'reply-job', jobData, {
      jobId,
    })

    logger.info(`Enqueued ${jobData.type} job ${jobId}`, {
      jobId,
      repo: repository.full_name,
      prNumber: pull_request.number,
      action,
    })
    return { status: 'queued', jobId }
  } catch (err) {
    logger.error('Failed to enqueue job', { error: err })
    throw createError({
      status: 500,
      message: 'Queue error',
    })
  }
})
