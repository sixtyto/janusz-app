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

  const eventStream = createEventStream(event)
  const channel = `janusz:events:${jobId}`

  const listener = async (message: string) => {
    await eventStream.push(`data: ${message}\n\n`)
  }

  await subscribeToChannel(channel, listener)

  eventStream.onClosed(async () => {
    await unsubscribeFromChannel(channel, listener).catch(console.error)
  })

  return eventStream.send()
})
