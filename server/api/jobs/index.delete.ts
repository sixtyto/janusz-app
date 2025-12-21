export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const id = typeof query.id === 'string' ? query.id.toString() : undefined

  if (!id) {
    throw createError({ status: 400, message: 'Missing job ID' })
  }

  try {
    await jobService.deleteJob(id)
    return { success: true }
  }
  catch (error: any) {
    throw createError({
      status: 400,
      message: error.message || 'Failed to delete job',
    })
  }
})
