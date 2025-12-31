export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user || !session.secure?.githubToken) {
    return
  }

  const now = Date.now()
  const expiresAt = session.secure.expiresAt || 0
  const timeUntilExpiration = expiresAt - now

  if (timeUntilExpiration > 5 * 60 * 1000) {
    return
  }

  if (!session.secure.refreshToken) {
    return
  }

  try {
    const newTokens = await refreshGitHubToken(session.secure.refreshToken)

    if (newTokens.access_token) {
      await setUserSession(event, {
        ...session,
        secure: {
          githubToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token,
          expiresAt: Date.now() + (newTokens.expires_in * 1000),
        },
      })
    }
  } catch {
    await clearUserSession(event)
  }
})
