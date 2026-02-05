import type { PrReviewJobData } from '#shared/types/PrReviewJobData'
import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { handleReplyJob } from '~~/server/utils/replyService'
import { setupCreateErrorMock, setupRuntimeConfigMock } from '../helpers/testHelpers'

vi.mock('~~/server/utils/useLogger', () => ({
  useLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

setupRuntimeConfigMock()
setupCreateErrorMock()

const mockGitHub = {
  getBotUser: vi.fn(),
  listReviewCommentsForPr: vi.fn(),
  getPrDiff: vi.fn(),
  createReactionForReviewComment: vi.fn(),
  createReplyForReviewComment: vi.fn(),
}

vi.mock('~~/server/utils/createGitHubClient', () => ({
  createGitHubClient: () => mockGitHub,
}))

const mockAnalyzeReply = vi.fn()
vi.mock('~~/server/utils/analyzePr', () => ({

  analyzeReply: (...args: unknown[]) => mockAnalyzeReply(...args),
}))

describe('replyService', () => {
  const createJob = (overrides: Partial<PrReviewJobData> = {}): Job<PrReviewJobData> => ({
    id: 'test-job-id',
    data: {
      repositoryFullName: 'owner/repo',
      installationId: 123,
      prNumber: 42,
      commentId: 101,
      ...overrides,
    },
    attemptsMade: 0,
    opts: {},
  } as Job<PrReviewJobData>)

  beforeEach(() => {
    vi.clearAllMocks()
    mockGitHub.getBotUser.mockResolvedValue({ slug: 'janusz-app' })
  })

  it('should throw error when commentId is missing', async () => {
    const job = createJob({ commentId: undefined })

    await expect(handleReplyJob(job)).rejects.toThrow('Missing commentId for reply job')
  })

  it('should throw error when bot user cannot be fetched', async () => {
    const job = createJob()
    mockGitHub.getBotUser.mockResolvedValue(null)

    await expect(handleReplyJob(job)).rejects.toThrow('Could not fetch bot user information')
  })

  it('should return early when comment is not found', async () => {
    const job = createJob()
    mockGitHub.listReviewCommentsForPr.mockResolvedValue([])

    await handleReplyJob(job)

    expect(mockAnalyzeReply).not.toHaveBeenCalled()
    expect(mockGitHub.createReplyForReviewComment).not.toHaveBeenCalled()
  })

  it('should skip when thread was not started by Janusz', async () => {
    const job = createJob()
    mockGitHub.listReviewCommentsForPr.mockResolvedValue([
      { id: 101, user: { login: 'other-user' }, body: 'Original comment', path: 'file.ts' },
    ])

    await handleReplyJob(job)

    expect(mockAnalyzeReply).not.toHaveBeenCalled()
    expect(mockGitHub.createReplyForReviewComment).not.toHaveBeenCalled()
  })

  it('should process reply when thread was started by Janusz', async () => {
    const job = createJob()
    mockGitHub.listReviewCommentsForPr.mockResolvedValue([
      { id: 100, user: { login: 'janusz-app[bot]' }, body: 'Fix this bug', path: 'app.ts' },
      { id: 101, user: { login: 'developer' }, body: 'Why?', path: 'app.ts', in_reply_to_id: 100 },
    ])
    mockGitHub.getPrDiff.mockResolvedValue([
      { filename: 'app.ts', patch: '@@ -1 +1 @@\n+code', status: 'modified' },
    ])
    mockAnalyzeReply.mockResolvedValue('Because of security reasons.')

    await handleReplyJob(job)

    expect(mockGitHub.createReactionForReviewComment).toHaveBeenCalledWith('owner', 'repo', 101, 'eyes')
    expect(mockAnalyzeReply).toHaveBeenCalledWith(
      [
        { author: 'janusz', body: 'Fix this bug' },
        { author: 'developer', body: 'Why?' },
      ],
      'app.ts',
      '@@ -1 +1 @@\n+code',
      expect.any(Object),
    )
    expect(mockGitHub.createReplyForReviewComment).toHaveBeenCalledWith(
      'owner',
      'repo',
      42,
      101,
      'Because of security reasons.',
    )
  })

  it('should continue even if adding reaction fails', async () => {
    const job = createJob()
    mockGitHub.listReviewCommentsForPr.mockResolvedValue([
      { id: 101, user: { login: 'janusz-app[bot]' }, body: 'Issue found', path: 'app.ts' },
    ])
    mockGitHub.getPrDiff.mockResolvedValue([])
    mockGitHub.createReactionForReviewComment.mockRejectedValue(new Error('Reaction failed'))
    mockAnalyzeReply.mockResolvedValue('Reply body')

    await handleReplyJob(job)

    expect(mockGitHub.createReplyForReviewComment).toHaveBeenCalled()
  })

  it('should use fallback when diff is not available for file', async () => {
    const job = createJob()
    mockGitHub.listReviewCommentsForPr.mockResolvedValue([
      { id: 101, user: { login: 'janusz-app[bot]' }, body: 'Comment', path: 'deleted-file.ts' },
    ])
    mockGitHub.getPrDiff.mockResolvedValue([
      { filename: 'other-file.ts', patch: 'other patch', status: 'modified' },
    ])
    mockAnalyzeReply.mockResolvedValue('Reply')

    await handleReplyJob(job)

    expect(mockAnalyzeReply).toHaveBeenCalledWith(
      expect.any(Array),
      'deleted-file.ts',
      'Diff context not available',
      expect.any(Object),
    )
  })
})
