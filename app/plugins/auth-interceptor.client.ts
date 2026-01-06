import type { FetchOptions, FetchRequest } from 'ofetch'

export default defineNuxtPlugin(() => {
  const { clear } = useUserSession()

  // Intercept global $fetch errors
  const originalFetch = globalThis.$fetch
  globalThis.$fetch = (async (request: FetchRequest, opts?: FetchOptions) => {
    return originalFetch(request, {
      ...opts,
      async onResponseError(context) {
        if (context.response?.status === 401) {
          // Clear client-side session state
          await clear()
          // Redirect to home page
          await navigateTo('/')
        }

        // Call original onResponseError if provided
        if (opts?.onResponseError) {
          await opts.onResponseError(context)
        }
      },
    })
  }) as typeof originalFetch
})
