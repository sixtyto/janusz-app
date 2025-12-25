import Redis from 'ioredis'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const jobId = getRouterParam(event, 'id')
  if (!jobId) {
    throw createError({
      statusCode: 400,
      message: 'Missing job ID',
    })
  }

  const config = useRuntimeConfig()

  const sub = new Redis(config.redisUrl)

  setResponseHeader(event, 'Content-Type', 'text/event-stream')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  setResponseHeader(event, 'Connection', 'keep-alive')
  setResponseHeader(event, 'Transfer-Encoding', 'chunked')

  const channel = `janusz:events:${jobId}`

  await sub.subscribe(channel)

  sub.on('message', (chan, message) => {
    if (chan === channel) {
      event.node.res.write(`data: ${message}\n\n`)
    }
  })

  return new Promise((resolve) => {
    event.node.req.on('close', () => {
      sub.quit()
      resolve(null)
    })
  })
})
