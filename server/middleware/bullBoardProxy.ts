import { defineEventHandler } from 'h3'
import { getBullBoardHandler } from '~~/server/utils/bullBoardInstance'
import { ensureAdminAccess } from '~~/server/utils/ensureAdminAccess'

export default defineEventHandler(async (event) => {
  const path = event.path

  if (!path.startsWith('/admin/queue')) {
    return
  }

  await ensureAdminAccess(event)

  const handler = getBullBoardHandler()
  if (!handler?.handler) {
    throw new Error('Bull Board handler not initialized')
  }

  return handler.handler(event)
})
