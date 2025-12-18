export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing ID' })
  }

  try {
    await jobService.deleteJob(id)
    return { success: true }
  }
  catch (error: any) {
    throw createError({
      statusCode: 400,
      statusMessage: error.message || 'Failed to delete job',
    })
  }
})
