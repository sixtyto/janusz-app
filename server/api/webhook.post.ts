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
  const { action, pull_request, repository, installation } = payload

  logger.info('Webhook received', {
    event,
    action,
    deliveryId,
    repo: repository?.full_name,
    installationId: installation?.id,
  })

  if (event !== 'pull_request') {
    return { status: 'ignored', reason: 'event_type' }
  }

  if (action !== 'opened' && action !== 'synchronize') {
    return { status: 'ignored', reason: 'action_type' }
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

  const jobData = {
    repositoryFullName: repository.full_name,
    installationId: installation.id,
    prNumber: pull_request.number,
    headSha: pull_request.head.sha,
    action,
  }

  const jobId = `${repository.full_name}-${pull_request.number}-${pull_request.head.sha}`

  try {
    await getPrReviewQueue().add('review-job', jobData, {
      jobId,
    })

    logger.info(`Enqueued job ${jobId}`, {
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
