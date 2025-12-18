export default defineOAuthGitHubEventHandler({
  async onSuccess(event, { user, tokens }) {
    await setUserSession(event, {
      user,
      secure: {
        githubToken: tokens.access_token,
      },
    })
    return sendRedirect(event, '/')
  },
})
