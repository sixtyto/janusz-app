import { ServiceType } from '#shared/types/ServiceType'

export default defineEventHandler(async (event) => {
  const logger = createLogger(ServiceType.api)
  await requireUserSession(event)
  // TODO: add user authorization check.

  const query = getQuery(event)
  const jobId = String(query.id || '')

  if (!jobId) {
    throw createError({
      statusCode: 400,
      message: 'Missing job ID',
    })
  }

  const job = await jobService.getJob(jobId)
  if (!job) {
    throw createError({
      statusCode: 404,
      message: 'Job not found',
    })
  }

  const eventStream = createEventStream(event)
  const channel = `janusz:events:${jobId}`

  const listener = async (message: string) => {
    await eventStream.push(message)
  }

  await subscribeToChannel(channel, listener)

  eventStream.onClosed(async () => {
    await unsubscribeFromChannel(channel, listener).catch((error) => {
      logger.error('Failed to unsubscribe', { error, jobId })
    })
  })

  return eventStream.send()
})
