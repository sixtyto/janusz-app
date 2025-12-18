import Redis from 'ioredis'

let redisClient: Redis

export function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
    })

    redisClient.on('error', (err) => {
      console.error('Redis Client Error', err)
    })
  }
  return redisClient
}
