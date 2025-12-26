export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const id = typeof body?.id === 'string' ? body.id : undefined

  if (!id) {
    throw createError({ status: 400, message: 'Missing job ID' })
  }

  try {
    const job = await jobService.retryJob(id)
    return { success: true, job }
  } catch (error: any) {
    throw createError({
      status: 400,
      message: error.message || 'Failed to retry job',
    })
  }
})
