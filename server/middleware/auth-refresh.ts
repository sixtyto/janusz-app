export default defineEventHandler(async (event) => {
  if (event.path.startsWith('/_') || event.path.includes('.')) {
    return
  }

  const session = await getUserSession(event)

  const hasRequiredTokens = session.user && session.secure?.githubToken && session.secure?.refreshToken
  if (!hasRequiredTokens) {
    return
  }

  const expiresAt = session.secure!.expiresAt || 0
  const isExpiringSoon = (expiresAt - Date.now()) < REFRESH_THRESHOLD_MS

  if (!isExpiringSoon) {
    return
  }

  try {
    const newTokens = await refreshGitHubToken(session.secure!.refreshToken!)

    if (newTokens?.access_token) {
      await setUserSession(event, {
        ...session,
        secure: {
          githubToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token,
          expiresAt: Date.now() + (newTokens.expires_in * 1000),
        },
      })
    }
  } catch (error) {
    const isActuallyExpired = Date.now() >= expiresAt

    if (isActuallyExpired) {
      console.error('[Auth] Token expired and refresh failed. Clearing session.', error)
      await clearUserSession(event)
      return
    }

    console.warn('[Auth] Refresh failed, but token still valid. Retrying on next request.', error)
  }
})
