import { z } from 'zod'

const bodySchema = z.object({
  id: z.string(),
})

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const result = bodySchema.safeParse(await readBody(event))

  if (!result.success) {
    throw createError({ status: 400, message: 'Missing job ID' })
  }

  const { id } = result.data

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
