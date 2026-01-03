import { ServiceType } from '#shared/types/ServiceType'
import { refreshToken } from '@octokit/oauth-methods'
import { RequestError } from '@octokit/request-error'

const REFRESH_THRESHOLD_MS = 5 * 60 * 1000

export default defineEventHandler(async (event) => {
  if (event.path.startsWith('/_') || event.path.includes('.')) {
    return
  }

  const session = await getUserSession(event)

  const hasRequiredTokens = session.user && session.secure?.githubToken && session.secure?.refreshToken
  if (!hasRequiredTokens) {
    return
  }

  const expiresAt = session.secure?.expiresAt ?? 0
  const isExpiringSoon = (expiresAt - Date.now()) < REFRESH_THRESHOLD_MS

  if (!isExpiringSoon) {
    return
  }

  const logger = createLogger(ServiceType.api)
  const config = useRuntimeConfig()

  try {
    const { authentication } = await refreshToken({
      clientType: 'github-app',
      clientId: config.oauth.github.clientId,
      clientSecret: config.oauth.github.clientSecret,
      refreshToken: session.secure!.refreshToken!,
    })

    await setUserSession(event, {
      ...session,
      secure: {
        githubToken: authentication.token,
        refreshToken: authentication.refreshToken,
        expiresAt: new Date(authentication.expiresAt).getTime(),
      },
    })
  } catch (error) {
    const isActuallyExpired = Date.now() >= expiresAt

    const isAuthError = error instanceof RequestError
      && (error.status === 400 || error.status === 401)

    if (isActuallyExpired || isAuthError) {
      logger.error('Token expired or refresh failed with auth error. Clearing session.', { error })
      await clearUserSession(event)
      return
    }

    logger.warn('Refresh failed, but token still valid. Retrying on next request.', { error })
  }
})
