import { z } from 'zod'

const bodySchema = z.object({
  id: z.string(),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const origin = getHeader(event, 'origin')
  if (!origin) {
    throw createError({ status: 403, message: 'Missing Origin header - cross-origin requests are not allowed' })
  }

  const host = getHeader(event, 'host')
  try {
    const originHost = new URL(origin).host
    if (originHost !== host) {
      throw createError({ status: 403, message: 'Cross-Origin Request Forbidden' })
    }
  } catch {
    throw createError({ status: 403, message: 'Invalid Origin header' })
  }

  const result = bodySchema.safeParse(await readBody(event))

  if (!result.success) {
    throw createError({ status: 400, message: 'Missing job ID' })
  }

  const { id } = result.data

  await verifyJobAccess(id, session)

  try {
    const job = await jobService.retryJob(id)
    return { success: true, job }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retry job'
    throw createError({
      status: 400,
      message,
    })
  }
})
