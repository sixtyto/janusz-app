interface GitHubTokensWithRefresh {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  refresh_token: string
  refresh_token_expires_in: number
  scope: string
}

export default defineOAuthGitHubEventHandler({
  async onSuccess(event, result) {
    const { user } = result
    const tokens = result.tokens as GitHubTokensWithRefresh

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
