import process from 'node:process'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxt/test-utils/module', 'nuxt-auth-utils', '@vueuse/nuxt', 'nuxt-security'],
  security: {
    csrf: true,
    rateLimiter: {
      tokensPerInterval: 240,
      interval: 60000,
      headers: true,
    },
    headers: {
      contentSecurityPolicy: {
        'default-src': ['\'self\''],
        'script-src': ['\'self\'', '\'unsafe-inline\''],
        'style-src': ['\'self\'', '\'unsafe-inline\''],
        'img-src': ['\'self\'', 'data:', 'https://avatars.githubusercontent.com'],
        'connect-src': ['\'self\''],
      },
    },
  },
  routeRules: {
    '/api/webhook': {
      csurf: false,
      security: {
        rateLimiter: {
          tokensPerInterval: 1000,
          interval: 60000,
          headers: true,
        },
      },
    },
    '/api/jobs/retry': {
      security: {
        rateLimiter: {
          tokensPerInterval: 10,
          interval: 60000,
          headers: true,
        },
      },
    },
    '/api/jobs/**': {
      security: {
        rateLimiter: {
          tokensPerInterval: 10,
          interval: 60000,
          headers: true,
        },
      },
    },
  },
  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL,
    githubAppId: process.env.GITHUB_APP_ID,
    githubPrivateKey: process.env.GITHUB_PRIVATE_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    redisUrl: process.env.REDIS_URL,
    webhookSecret: process.env.WEBHOOK_SECRET,
    concurrency: process.env.CONCURRENCY ?? '5',
    queueName: process.env.QUEUE_NAME ?? 'pr-review',
    oauth: {
      // provider in lowercase (github, google, etc.)
      github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      },
    },
  },
})
