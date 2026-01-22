import { expect, test } from '@playwright/test'

test('Reply flow endpoint returns 403 without signature', async ({ request }) => {
  const response = await request.post('/api/webhook', {
    data: {
      action: 'created',
      installation: { id: 123 },
      repository: { name: 'test', full_name: 'test/test' },
      comment: { id: 1, body: 'test' },
    },
    timeout: 10_000,
  })
  expect(response.status()).toBe(403)
})
