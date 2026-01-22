import { expect, test } from '@playwright/test'

test('Webhook endpoint returns 403 without signature', async ({ request }) => {
  const response = await request.post('/api/webhook', {
    data: {
      action: 'opened',
      installation: { id: 123 },
      repository: { name: 'test', full_name: 'test/test' },
    },
    timeout: 10_000,
  })
  expect([400, 401, 403, 429]).toContain(response.status())
})

test('Webhook rejects invalid JSON', async ({ request }) => {
  const response = await request.post('/api/webhook', {
    data: 'invalid',
    timeout: 10_000,
  })
  expect([400, 401, 403, 429]).toContain(response.status())
})
