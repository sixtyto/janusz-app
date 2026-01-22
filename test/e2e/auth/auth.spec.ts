import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('Unauthenticated user sees login prompt', async ({ page }) => {
  await expect(page.getByTestId('login-button')).toBeVisible()
})

test('Page title is visible', async ({ page }) => {
  await expect(page.getByTestId('page-title')).toBeVisible()
})
