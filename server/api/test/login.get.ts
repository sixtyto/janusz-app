import process from 'node:process'

export default defineEventHandler(async (event) => {
  if (!import.meta.dev && (!process.env.ENABLE_TEST_LOGIN || process.env.ENABLE_TEST_LOGIN !== 'true')) {
    throw createError({ statusCode: 404 })
  }
  const query = getQuery(event)

  await setUserSession(event, {
    user: {
      id: 123,
      login: (query.login as string) || 'test-user',
      avatar_url: 'https://github.com/nuxt.png',
      name: (query.name as string) || 'Test User',
      node_id: '',
      gravatar_id: '',
      url: '',
      html_url: '',
      followers_url: '',
      following_url: '',
      gists_url: '',
      starred_url: '',
      subscriptions_url: '',
      organizations_url: '',
      repos_url: '',
      events_url: '',
      received_events_url: '',
      type: '',
      site_admin: false,
      company: null,
      blog: null,
      location: null,
      email: null,
      hireable: null,
      bio: null,
      twitter_username: null,
      public_repos: 0,
      public_gists: 0,
      followers: 0,
      following: 0,
      created_at: '',
      updated_at: '',
    },
  })
  return { success: true }
})
