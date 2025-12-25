export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const jobId = decodeURIComponent(getRouterParam(event, 'id') || '')
  if (!jobId) {
    throw createError({
      statusCode: 400,
      message: 'Missing job ID',
    })
  }

  const job = await jobService.getJob(jobId)
  if (!job) {
    throw createError({
      statusCode: 404,
      message: 'Job not found',
    })
  }

  setResponseHeader(event, 'Content-Type', 'text/event-stream')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  setResponseHeader(event, 'Connection', 'keep-alive')
  setResponseHeader(event, 'Transfer-Encoding', 'chunked')

  const channel = `janusz:events:${jobId}`

  const listener = (message: string) => {
    event.node.res.write(`data: ${message}\n\n`)
  }

  await subscribeToChannel(channel, listener)

  return new Promise((resolve) => {
    event.node.req.on('close', () => {
      unsubscribeFromChannel(channel, listener).catch(console.error)
      resolve(null)
    })
  })
})
