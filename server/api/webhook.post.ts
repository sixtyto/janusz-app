import { Webhooks } from '@octokit/webhooks'

const logger = createLogger('webhook')

const webhooks = new Webhooks<string>({
  secret: config.WEBHOOK_SECRET,
})

export default defineEventHandler(async (h3event) => {
  const body = await h3event.req.text()
  const signature = getHeader(h3event, 'x-hub-signature-256')

  if (!body || !signature) {
    throw createError({ statusCode: 400, statusMessage: 'Missing body or signature' })
  }

  const isValid = await webhooks.verify(body, signature)
  if (!isValid) {
    logger.warn(`Auth failed: ${body}`)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
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
      statusCode: 400,
      statusMessage: 'Invalid payload',
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
    await prReviewQueue.add('review-job', jobData, {
      jobId,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 30_000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    })

    logger.info(`Enqueued job ${jobId}`, {
      jobId,
      repo: repository.full_name,
      prNumber: pull_request.number,
      action,
    })
    return { status: 'queued', jobId }
  }
  catch (err) {
    logger.error('Failed to enqueue job', { error: err })
    throw createError({
      statusCode: 500,
      statusMessage: 'Queue error',
    })
  }
})
