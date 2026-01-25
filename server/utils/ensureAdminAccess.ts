import type { H3Event } from 'h3'

export async function ensureAdminAccess(event: H3Event) {
  const session = await requireUserSession(event)
  const config = useRuntimeConfig()

  if (session.user?.site_admin) {
    return
  }

  if (config.bullBoardAdmins?.includes(session.user?.login)) {
    return
  }

  throw createError({
    status: 403,
    message: 'Access denied: Admin privileges required',
  })
}
