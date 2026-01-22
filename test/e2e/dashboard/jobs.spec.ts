import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/jobs')
})

test('Jobs page redirects to home when not authenticated', async ({ page }) => {
  await expect(page).toHaveURL('/')
})

test('Jobs page has content', async ({ page }) => {
  // Use direct navigation to the test login endpoint to set the session cookie in the browser context
  await page.goto('/api/test/login')

  await page.goto('/jobs')
  await expect(page.getByTestId('jobs-card')).toBeVisible()
})
