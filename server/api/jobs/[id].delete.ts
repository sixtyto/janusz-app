export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, message: 'Missing ID' })
  }

  try {
    await jobService.deleteJob(decodeURIComponent(id))
    return { success: true }
  }
  catch (error: any) {
    throw createError({
      status: 400,
      message: error.message || 'Failed to delete job',
    })
  }
})
