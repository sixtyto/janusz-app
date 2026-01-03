export interface GitHubTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  refresh_token_expires_in: number
  scope: string
  token_type: string
}

export interface GitHubTokenErrorResponse {
  error: string
  error_description: string
  error_uri?: string
}

export class GitHubTokenRefreshError extends Error {
  constructor(
    public readonly errorCode: string,
    public readonly errorDescription: string,
  ) {
    super(`GitHub token refresh failed: ${errorCode} - ${errorDescription}`)
    this.name = 'GitHubTokenRefreshError'
  }

  get isInvalidToken(): boolean {
    return this.errorCode === 'bad_refresh_token'
  }
}

function isGitHubErrorResponse(
  response: GitHubTokenResponse | GitHubTokenErrorResponse,
): response is GitHubTokenErrorResponse {
  return 'error' in response
}

export async function refreshGitHubToken(refreshToken: string): Promise<GitHubTokenResponse> {
  const config = useRuntimeConfig()

  const queryParameters = new URLSearchParams({
    client_id: config.oauth.github.clientId,
    client_secret: config.oauth.github.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })

  const response = await $fetch<GitHubTokenResponse | GitHubTokenErrorResponse>(
    `https://github.com/login/oauth/access_token?${queryParameters.toString()}`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
    },
  )

  if (isGitHubErrorResponse(response)) {
    throw new GitHubTokenRefreshError(response.error, response.error_description)
  }

  return response
}
