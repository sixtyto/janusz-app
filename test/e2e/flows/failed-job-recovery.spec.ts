import { expect, test } from '@playwright/test'

test('Failed job flow endpoint returns 403 without authentication', async ({ request }) => {
  const response = await request.post('/api/jobs/retry', {
    data: { jobId: 'test-123' },
    timeout: 10_000,
  })
  expect(response.status()).toBe(403)
})
