export default defineOAuthGitHubEventHandler({
  async onSuccess(event, result) {
    const { user, tokens } = result
    await setUserSession(event, {
      user,
      secure: {
        githubToken: tokens.access_token,
      },
    })
    sendRedirect(event, '/', 302)
  },
})
