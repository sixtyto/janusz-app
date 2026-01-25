import { createError, defineEventHandler } from 'h3'
import { getBullBoardRouter } from '~~/server/utils/bullBoardInstance'
import { ensureAdminAccess } from '~~/server/utils/ensureAdminAccess'

export default defineEventHandler(async (event) => {
  const path = event.path

  if (!path.startsWith('/admin/queue/') && path !== '/admin/queue') {
    return
  }

  await ensureAdminAccess(event)

  const router = getBullBoardRouter()

  try {
    return await router.handler(event)
  } catch (error) {
    console.error('[BullBoard] Error:', error)
    throw createError({
      statusCode: 500,
      message: 'Bull Board error',
    })
  }
})
