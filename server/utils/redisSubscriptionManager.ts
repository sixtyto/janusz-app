import { EventEmitter } from 'node:events'
import { ServiceType } from '#shared/types/ServiceType'

const eventEmitter = new EventEmitter()
const logger = createLogger(ServiceType.redis)
let isInitialized = false

function getRedis() {
  return getRedisSubscriber()
}

function initialize() {
  if (isInitialized) {
    return
  }

  getRedis().on('message', (channel: string, message: string) => {
    eventEmitter.emit(channel, message)
  })
  isInitialized = true
}

export async function subscribeToChannel(channel: string, listener: (message: string) => void) {
  initialize()
  if (eventEmitter.listenerCount(channel) === 0) {
    try {
      await getRedis().subscribe(channel)
    } catch (error) {
      logger.error(`Failed to subscribe to channel ${channel}`, { error })
      throw error
    }
  }
  eventEmitter.on(channel, listener)
}

export async function unsubscribeFromChannel(channel: string, listener: (message: string) => void) {
  eventEmitter.off(channel, listener)
  if (eventEmitter.listenerCount(channel) === 0) {
    try {
      await getRedis().unsubscribe(channel)
    } catch (error) {
      logger.error(`Failed to unsubscribe from channel ${channel}`, { error })
    }
  }
}
