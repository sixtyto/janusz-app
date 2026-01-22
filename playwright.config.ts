import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './test/e2e',
  forbidOnly: true,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev:test',
    url: 'http://localhost:3000',
    timeout: 120_000,
    // eslint-disable-next-line node/prefer-global/process
    reuseExistingServer: !process.env.CI,
  },
})
