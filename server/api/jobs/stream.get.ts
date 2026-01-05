import { ServiceType } from '#shared/types/ServiceType'
import { verifyJobAccess } from '~~/server/utils/verifyJobAccess'

export default defineEventHandler(async (event) => {
  const logger = createLogger(ServiceType.api)
  const session = await requireUserSession(event)

  const query = getQuery(event)
  const jobId = typeof query.id === 'string' ? query.id : ''

  if (!jobId) {
    throw createError({
      statusCode: 400,
      message: 'Missing job ID',
    })
  }

  await verifyJobAccess(jobId, session)

  const eventStream = createEventStream(event)
  const channel = `janusz:events:${jobId}`

  const listener = (message: string) => {
    eventStream.push(message).catch((error: unknown) => {
      logger.error('Failed to push event to stream', { error, jobId })
    })
  }

  await subscribeToChannel(channel, listener)

  eventStream.onClosed(() => {
    void unsubscribeFromChannel(channel, listener).catch((error: unknown) => {
      logger.error('Failed to unsubscribe', { error, jobId })
    })
  })

  return eventStream.send()
})
