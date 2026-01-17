import { ServiceType } from '#shared/types/ServiceType'
import { useRateLimiter } from '~~/server/utils/rateLimiter'
import { useLogger } from '~~/server/utils/useLogger'

export default defineEventHandler(async (event) => {
  await useRateLimiter(event, { maxRequests: 20 })

  const logger = useLogger(ServiceType.api)
  const session = await requireUserSession(event)

  const query = getQuery(event)
  const jobId = typeof query.id === 'string' ? query.id : ''

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
