import { expect, test } from '@playwright/test'

test('Duplicate webhook endpoint returns 403 without signature', async ({ request }) => {
  const response = await request.post('/api/webhook', {
    data: {
      action: 'opened',
      installation: { id: 123 },
      repository: { name: 'test', full_name: 'test/test' },
    },
    timeout: 10_000,
  })
  expect(response.status()).toBe(403)
})
