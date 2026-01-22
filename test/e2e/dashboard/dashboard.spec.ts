import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('Dashboard displays content', async ({ page }) => {
  await expect(page.getByTestId('login-message').or(page.getByTestId('stats-grid'))).toBeVisible()
})

test('Dashboard is accessible', async ({ page }) => {
  await expect(page).toHaveURL('/')
})
