export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing ID' })
  }

  try {
    const job = await jobService.retryJob(id)
    return { success: true, job }
  }
  catch (error: any) {
    throw createError({
      statusCode: 400,
      statusMessage: error.message || 'Failed to retry job',
    })
  }
})
