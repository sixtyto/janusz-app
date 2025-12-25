import Redis from 'ioredis'

let redisClient: Redis
let redisSubscriber: Redis

export function getRedisClient() {
  if (!redisClient) {
    const config = useRuntimeConfig()
    redisClient = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
    })

    redisClient.on('error', (err) => {
      console.error('Redis Client Error', err)
    })
  }
  return redisClient
}

export function getRedisSubscriber() {
  if (!redisSubscriber) {
    const config = useRuntimeConfig()
    redisSubscriber = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
    })

    redisSubscriber.on('error', (err) => {
      console.error('Redis Subscriber Error', err)
    })

    redisSubscriber.setMaxListeners(0)
  }
  return redisSubscriber
}
