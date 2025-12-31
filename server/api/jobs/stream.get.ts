import { ServiceType } from '#shared/types/ServiceType'

export default defineEventHandler(async (event) => {
  const logger = createLogger(ServiceType.api)
  const session = await requireUserSession(event)

  const query = getQuery(event)
  const jobId = typeof query.id === 'string' ? query.id : ''

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

  const repositoryFullName = job.data.repositoryFullName
  if (!repositoryFullName) {
    throw createError({
      statusCode: 500,
      message: 'Invalid job data: missing repository info',
    })
  }

  const { owner, repo } = parseRepositoryName(repositoryFullName)

  if (session.user.login !== owner) {
    try {
      await $fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          'Authorization': `Bearer ${session.secure?.githubToken}`,
          'User-Agent': 'Janusz-App',
        },
      })
    } catch {
      throw createError({
        statusCode: 403,
        message: 'You do not have access to view this job',
      })
    }
  }

  const eventStream = createEventStream(event)
  const channel = `janusz:events:${jobId}`

  const listener = async (message: string) => {
    await eventStream.push(message)
  }

  await subscribeToChannel(channel, listener)

  eventStream.onClosed(async () => {
    await unsubscribeFromChannel(channel, listener).catch((error) => {
      logger.error('Failed to unsubscribe', { error, jobId })
    })
  })

  return eventStream.send()
})
