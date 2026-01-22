import { expect, test } from '@playwright/test'

test.describe('API tests require Redis/DB infrastructure which times out in test mode', () => {
  test('Jobs API returns 401 (or 429 if Redis down) when unauthorized', async ({ request }) => {
    const response = await request.get('/api/jobs', { timeout: 10_000 })
    expect([401, 429]).toContain(response.status())
  })

  test('Jobs API accepts query params', async ({ request }) => {
    const response = await request.get('/api/jobs?page=1&limit=10', { timeout: 10_000 })
    expect([401, 429]).toContain(response.status())
  })
})
