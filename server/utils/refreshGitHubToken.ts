export async function refreshGitHubToken(refreshToken: string) {
  const config = useRuntimeConfig()

  return await $fetch<{
    access_token: string
    refresh_token: string
    expires_in: number
    refresh_token_expires_in: number
    token_type: string
  }>('https://github.com/login/oauth/access_token', {
    method: 'POST',
    body: {
      client_id: config.oauth.github.clientId,
      client_secret: config.oauth.github.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    },
    headers: {
      Accept: 'application/json',
    },
  })
}
