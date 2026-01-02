interface GitHubTokensWithRefresh {
  access_token: string
  scope: string
  token_type: string
  expires_in?: number
  refresh_token?: string
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
    return sendRedirect(event, '/', 302)
  },
})
