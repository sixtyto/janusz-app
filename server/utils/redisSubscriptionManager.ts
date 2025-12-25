import { EventEmitter } from 'node:events'

const eventEmitter = new EventEmitter()
eventEmitter.setMaxListeners(0)
let isInitialized = false

function getRedis() {
  return getRedisSubscriber()
}

function initialize() {
  if (isInitialized)
    return

  getRedis().on('message', (channel: string, message: string) => {
    eventEmitter.emit(channel, message)
  })
  isInitialized = true
}

export async function subscribeToChannel(channel: string, listener: (message: string) => void) {
  initialize()
  const isFirstListener = eventEmitter.listenerCount(channel) === 0
  eventEmitter.on(channel, listener)

  if (isFirstListener) {
    try {
      await getRedis().subscribe(channel)
    }
    catch (error) {
      console.error(`Failed to subscribe to channel ${channel}`, error)
    }
  }
}

export async function unsubscribeFromChannel(channel: string, listener: (message: string) => void) {
  eventEmitter.off(channel, listener)
  if (eventEmitter.listenerCount(channel) === 0) {
    try {
      await getRedis().unsubscribe(channel)
    }
    catch (error) {
      console.error(`Failed to unsubscribe from channel ${channel}`, error)
    }
  }
}
