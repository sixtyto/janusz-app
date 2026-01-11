import process from 'node:process'
import { downloadGrammars } from './scripts/downloadGrammars'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  typescript: {
    strict: true,
  },
  css: ['~/assets/css/main.css'],
  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxt/test-utils/module', 'nuxt-auth-utils', '@vueuse/nuxt'],
  hooks: {
    'build:before': downloadGrammars,
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
