import { vi } from 'vitest'

export function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}

export function setupLoggerMock() {
  vi.mock('~~/server/utils/createLogger', () => ({
    createLogger: () => createMockLogger(),
  }))
}

export function createMockRedisClient() {
  const pipelineMock = {
    del: vi.fn().mockReturnThis(),
    hset: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  }

  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    lrange: vi.fn().mockResolvedValue([]),
    pipeline: vi.fn(() => pipelineMock),
  }
}

export function setupRedisMock() {
  vi.mock('~~/server/utils/getRedisClient', () => ({
    getRedisClient: () => createMockRedisClient(),
  }))
}

export function createMockGeminiResponse(responseData: unknown) {
  return {
    text: JSON.stringify(responseData),
  }
}

export function setupRuntimeConfigMock(config: Record<string, unknown> = {}) {
  const defaultConfig = {
    geminiApiKey: 'test-gemini-key',
    githubAppId: 'test-app-id',
    githubPrivateKey: 'test-private-key',
    ...config,
  }

  vi.stubGlobal('useRuntimeConfig', () => defaultConfig)
}

export function createMockGitHubClient() {
  return {
    getPrDiff: vi.fn().mockResolvedValue([]),
    postReview: vi.fn().mockResolvedValue(undefined),
    createCheckRun: vi.fn().mockResolvedValue(999),
    updateCheckRun: vi.fn().mockResolvedValue(undefined),
    getExistingReviewComments: vi.fn().mockResolvedValue(new Set()),
    getBotUser: vi.fn().mockResolvedValue({ slug: 'janusz-app' }),
    getToken: vi.fn().mockResolvedValue('fake-token'),
    updatePullRequest: vi.fn().mockResolvedValue(undefined),
    listReviewCommentsForPr: vi.fn().mockResolvedValue([]),
    createReactionForReviewComment: vi.fn().mockResolvedValue(undefined),
    createReplyForReviewComment: vi.fn().mockResolvedValue(undefined),
    postFallbackComment: vi.fn().mockResolvedValue(undefined),
    getReviewComment: vi.fn().mockResolvedValue({}),
  }
}
