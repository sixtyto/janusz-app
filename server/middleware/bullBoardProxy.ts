import { defineEventHandler } from 'h3'
import { getBullBoardMiddleware } from '~~/server/utils/bullBoardInstance'
import { ensureAdminAccess } from '~~/server/utils/ensureAdminAccess'

export default defineEventHandler(async (event) => {
  const path = event.path

  if (!path.startsWith('/admin/queue/') && path !== '/admin/queue') {
    return
  }

  await ensureAdminAccess(event)

  const middleware = getBullBoardMiddleware()

  return new Promise((resolve, reject) => {
    middleware(event.node.req, event.node.res, (error?: unknown) => {
      if (error) {
        console.error('[BullBoard Proxy] Middleware error:', error)
        reject(error)
      } else {
        event._handled = true
        resolve(undefined)
      }
    })
  })
})
