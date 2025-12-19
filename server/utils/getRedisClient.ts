import Redis from 'ioredis'

let redisClient: Redis

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
