export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ status: 400, message: 'Missing job ID' })
  }

  await verifyJobAccess(id, session)

  try {
    await jobService.deleteJob(id)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete job'
    throw createError({
      status: 400,
      message,
    })
  }
})
