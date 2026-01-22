import { expect, test } from '@playwright/test'

test.describe('Rate limiting tests require Redis infrastructure', () => {
  test('Rate limiting endpoint responds with 429 (fail-closed if Redis down)', async ({ request }) => {
    const response = await request.get('/api/jobs', { timeout: 10_000 })
    expect(response.status()).toBe(429)
  })
})
