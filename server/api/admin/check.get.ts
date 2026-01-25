export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)

  if (!session?.user) {
    return { isAdmin: false }
  }

  const config = useRuntimeConfig()

  const isSiteAdmin = session.user.site_admin
  const isWhitelisted = config.bullBoardAdmins?.includes(session.user.login)

  return {
    isAdmin: isSiteAdmin || isWhitelisted,
  }
})
