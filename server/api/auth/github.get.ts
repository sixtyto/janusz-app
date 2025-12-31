export default defineOAuthGitHubEventHandler({
  async onSuccess(event, result) {
    const { user, tokens } = result

    const expiresAt = tokens.expires_in ? Date.now() + (tokens.expires_in * 1000) : undefined

    await setUserSession(event, {
      user,
      secure: {
        githubToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
      },
    })
    sendRedirect(event, '/', 302)
  },
})
