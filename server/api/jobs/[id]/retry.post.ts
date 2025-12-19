export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, message: 'Missing ID' })
  }

  try {
    const job = await jobService.retryJob(decodeURIComponent(id))
    return { success: true, job }
  }
  catch (error: any) {
    throw createError({
      status: 400,
      message: error.message || 'Failed to retry job',
    })
  }
})
