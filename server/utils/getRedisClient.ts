import { ServiceType } from '#shared/types/ServiceType'
import Redis from 'ioredis'
import { useLogger } from './useLogger'

let redisClient: Redis
let redisSubscriber: Redis

export function getRedisClient() {
  if (!redisClient) {
    const config = useRuntimeConfig()
    redisClient = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      connectTimeout: 5000,
      commandTimeout: 5000,
      retryStrategy: (times) => {
        // More robust strategy: backoff but never give up entirely for a core singleton
        return Math.min(times * 100, 3000)
      },
    })

    redisClient.on('error', (err) => {
      useLogger(ServiceType.redis).error('Redis Client Error', { error: err })
    })
  }
  return redisClient
}

export function getRedisSubscriber() {
  if (!redisSubscriber) {
    const config = useRuntimeConfig()
    redisSubscriber = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      connectTimeout: 5000,
      commandTimeout: 5000,
      retryStrategy: (times) => {
        return Math.min(times * 100, 3000)
      },
    })

    redisSubscriber.on('error', (err) => {
      useLogger(ServiceType.redis).error('Redis Subscriber Error', { error: err })
    })

    redisSubscriber.setMaxListeners(0)
  }
  return redisSubscriber
}
