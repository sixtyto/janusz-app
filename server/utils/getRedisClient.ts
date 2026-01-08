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
    })

    redisSubscriber.on('error', (err) => {
      useLogger(ServiceType.redis).error('Redis Subscriber Error', { error: err })
    })

    redisSubscriber.setMaxListeners(0)
  }
  return redisSubscriber
}
