import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineVitestConfig } from '@nuxt/test-utils/config'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    root: currentDirectory,
    exclude: ['node_modules/**', 'test/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['server/**/*.ts', 'app/**/*.ts'],
      exclude: [
        'shared/types/**',
        'nuxt.config.ts',
        'server/utils/createLogger.ts',
        'server/utils/getRedisClient.ts',
        'server/utils/getPrReviewQueue.ts',
        'server/utils/startWorker.ts',
        'server/plugins/worker.ts',
      ],
    },
  },
})
