import type { PrReviewJobData } from '#shared/types/PrReviewJobData'
import type { Job } from 'bullmq'
import type { ReviewComment } from '~~/shared/types/ReviewComment'
import { GENERATED_DESCRIPTION_END_MARKER, GENERATED_DESCRIPTION_START_MARKER } from '#shared/constants/descriptionMarkers'
import { JobType } from '#shared/types/JobType'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as analyzePrModule from '~~/server/utils/analyzePr'

import * as githubClientModule from '~~/server/utils/createGitHubClient'

import { processJob } from '~~/server/utils/processJob'

import * as provisionRepoModule from '~~/server/utils/provisionRepo'

vi.mock('~~/server/utils/useLogger', () => ({
  useLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))
vi.mock('~~/server/utils/analyzePr')
vi.mock('~~/server/utils/commentVerifier', () => ({
  verifyReviewComments: vi.fn(async (_diffs, comments) => ({
    approved: comments,
    rejected: [],
  })),
}))
vi.mock('~~/server/utils/createGitHubClient')
vi.mock('~~/server/utils/provisionRepo')
vi.mock('~~/server/utils/selectContextFiles', () => ({
  selectContextFiles: vi.fn().mockResolvedValue([]),
}))
vi.mock('~~/server/utils/jobService', () => ({
  jobService: {
    updateJobExecutionHistory: vi.fn().mockResolvedValue(undefined),
  },
}))
vi.mock('~~/server/utils/jobExecutionCollector', () => ({
  createJobExecutionCollector: vi.fn(() => ({
    startAgent: vi.fn(),
    recordAgentAttempt: vi.fn(),
    completeAgent: vi.fn(),
    failAgent: vi.fn(),
    startOperation: vi.fn(),
    recordOperationAttempt: vi.fn(),
    completeOperation: vi.fn(),
    failOperation: vi.fn(),
    setCommentStats: vi.fn(),
    finalize: vi.fn().mockReturnValue({
      startedAt: '2025-01-01T00:00:00Z',
      completedAt: '2025-01-01T00:00:05Z',
      totalDurationMs: 5000,
      agentExecutions: [],
      executionMode: 'sequential',
      operations: [],
      totalCommentsRaw: 0,
      totalCommentsMerged: 0,
      totalCommentsPosted: 0,
      totalInputTokens: 100,
      totalOutputTokens: 50,
      preferredModel: 'default',
      filesAnalyzed: 1,
    }),
  })),
}))

describe('feature: Pull Request Review', () => {
  const mockGitHub = {
    getPrDiff: vi.fn(),
    postReview: vi.fn(),
    createCheckRun: vi.fn().mockResolvedValue(999),
    updateCheckRun: vi.fn(),
    getExistingReviewComments: vi.fn().mockResolvedValue(new Set()),
    getBotUser: vi.fn().mockResolvedValue({ slug: 'janusz-app' } as any),
    getToken: vi.fn().mockResolvedValue('fake-token'),
    updatePullRequest: vi.fn(),
    listReviewCommentsForPr: vi.fn(),
    createReactionForReviewComment: vi.fn(),
    createReplyForReviewComment: vi.fn(),
    postFallbackComment: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(githubClientModule.createGitHubClient).mockReturnValue(mockGitHub as unknown as ReturnType<typeof githubClientModule.createGitHubClient>)
    vi.mocked(provisionRepoModule.provisionRepo).mockResolvedValue({
      index: {},
      repoDir: '/tmp/fake-repo',
      cleanup: vi.fn().mockResolvedValue(undefined),
    })
  })

  const given = {
    pullRequestJob: (overrides: Partial<PrReviewJobData> & { attemptsMade?: number } = {}) => {
      const { attemptsMade, ...dataOverrides } = overrides
      return {
        id: 'test-job-id',
        data: {
          repositoryFullName: 'owner/repo',
          installationId: 123,
          prNumber: 42,
          headSha: 'sha-123',
          type: JobType.REVIEW,
          prBody: 'Fixed some bugs',
          ...dataOverrides,
        },
        attemptsMade: attemptsMade ?? 0,
        opts: {},
      } as Job<PrReviewJobData>
    },
    replyJob: (commentId: number, overrides: Partial<PrReviewJobData> = {}) => {
      return {
        id: 'reply-job-id',
        data: {
          repositoryFullName: 'owner/repo',
          installationId: 123,
          prNumber: 42,
          commentId,
          type: JobType.REPLY,
          ...overrides,
        },
        attemptsMade: 0,
        opts: {},
      } as Job<PrReviewJobData>
    },
    diffWithFile: (filename: string, patch: string) => {
      mockGitHub.getPrDiff.mockResolvedValue([{ filename, patch, status: 'modified' }])
    },
    emptyDiff: () => {
      mockGitHub.getPrDiff.mockResolvedValue([])
    },
    aiFindsIssues: (summary: string, comments: ReviewComment[]) => {
      vi.mocked(analyzePrModule.analyzePr).mockResolvedValue({
        summary,
        comments,
        totalRawComments: comments.length,
        totalMergedComments: comments.length,
      })
    },
    commentThread: (comments: any[]) => {
      mockGitHub.listReviewCommentsForPr.mockResolvedValue(comments)
    },
    aiGeneratesReply: (replyBody: string) => {
      vi.mocked(analyzePrModule.analyzeReply).mockResolvedValue(replyBody)
    },
    aiFails: () => {
      vi.mocked(analyzePrModule.analyzePr).mockRejectedValue(new Error('AI Explosion'))
    },
  }

  const when = {
    processingTheJob: async (job: Job<PrReviewJobData>) => {
      await processJob(job)
    },
  }

  const then = {
    reviewShouldBePostedWith: (expectedSummary: string, expectedCommentBody: string) => {
      expect(mockGitHub.postReview).toHaveBeenCalledWith(
        'owner',
        'repo',
        42,
        'sha-123',
        expectedSummary,
        expect.arrayContaining([
          expect.objectContaining({

            body: expect.stringContaining(expectedCommentBody),
          }),
        ]),
      )
    },
    checkRunShouldBeCompletedWith: (conclusion: string) => {
      expect(mockGitHub.updateCheckRun).toHaveBeenCalledWith(
        'owner',
        'repo',
        expect.any(Number),
        conclusion,
        expect.any(Object),
      )
    },
    prDescriptionShouldBeUpdatedWith: (body: string) => {
      expect(mockGitHub.updatePullRequest).toHaveBeenCalledWith(
        'owner',
        'repo',
        42,
        body,
      )
    },
    reactionShouldBeAdded: (commentId: number, content: string) => {
      expect(mockGitHub.createReactionForReviewComment).toHaveBeenCalledWith('owner', 'repo', commentId, content)
    },
    replyShouldBePosted: (commentId: number, body: string) => {
      expect(mockGitHub.createReplyForReviewComment).toHaveBeenCalledWith('owner', 'repo', 42, commentId, body)
    },
    fallbackCommentShouldBePosted: (bodySnippet: string) => {
      expect(mockGitHub.postFallbackComment).toHaveBeenCalledWith(
        'owner',
        'repo',
        42,
        expect.stringContaining(bodySnippet),
      )
    },
    shouldThrowError: async (promise: Promise<any>) => {
      await expect(promise).rejects.toThrow()
    },
  }

  it('scenario: AI finds a critical bug in the code', async () => {
    const job = given.pullRequestJob()
    given.diffWithFile('app.ts', '@@ -1,1 +1,1 @@\n-old\n+console.log(eval("user_input"));')
    given.aiFindsIssues('Found a critical vulnerability', [
      {
        filename: 'app.ts',
        snippet: 'console.log(eval("user_input"));',
        body: 'Potential Remote Code Execution via eval()',
        severity: 'CRITICAL',
        confidence: 1.0,
      },
    ])

    await when.processingTheJob(job)

    then.reviewShouldBePostedWith('Found a critical vulnerability', 'Potential Remote Code Execution')
    then.checkRunShouldBeCompletedWith('neutral') // Currently mapped to neutral in code for critical
  })

  it('scenario: Empty PR description should be automatically generated', async () => {
    const job = given.pullRequestJob({ prBody: '' })
    given.diffWithFile('README.md', '@@ -1,1 +1,2 @@\n # Project\n+Adding more documentation.')
    given.aiFindsIssues('Review complete', [])
    vi.mocked(analyzePrModule.generatePrDescription).mockResolvedValue(`${GENERATED_DESCRIPTION_START_MARKER}\n### 📝 Description\nGenerated summary.\n${GENERATED_DESCRIPTION_END_MARKER}`)

    await when.processingTheJob(job)

    then.prDescriptionShouldBeUpdatedWith(`${GENERATED_DESCRIPTION_START_MARKER}\n### 📝 Description\nGenerated summary.\n${GENERATED_DESCRIPTION_END_MARKER}`)
  })

  it('scenario: User description without markers should get generated description appended', async () => {
    const job = given.pullRequestJob({ prBody: 'User wrote this description' })
    given.diffWithFile('README.md', '@@ -1,1 +1,2 @@\n # Project\n+Adding more documentation.')
    given.aiFindsIssues('Review complete', [])
    vi.mocked(analyzePrModule.generatePrDescription).mockResolvedValue(`${GENERATED_DESCRIPTION_START_MARKER}\n### 📝 AI Summary\n${GENERATED_DESCRIPTION_END_MARKER}`)

    await when.processingTheJob(job)

    then.prDescriptionShouldBeUpdatedWith(`User wrote this description\n\n${GENERATED_DESCRIPTION_START_MARKER}\n### 📝 AI Summary\n${GENERATED_DESCRIPTION_END_MARKER}`)
  })

  it('scenario: Previously generated description should be replaced', async () => {
    const oldGenerated = `${GENERATED_DESCRIPTION_START_MARKER}\nOld generated content\n${GENERATED_DESCRIPTION_END_MARKER}`
    const job = given.pullRequestJob({ prBody: oldGenerated })
    given.diffWithFile('README.md', '@@ -1,1 +1,2 @@\n # Project\n+Adding more documentation.')
    given.aiFindsIssues('Review complete', [])
    vi.mocked(analyzePrModule.generatePrDescription).mockResolvedValue(`${GENERATED_DESCRIPTION_START_MARKER}\nNew generated content\n${GENERATED_DESCRIPTION_END_MARKER}`)

    await when.processingTheJob(job)

    then.prDescriptionShouldBeUpdatedWith(`${GENERATED_DESCRIPTION_START_MARKER}\nNew generated content\n${GENERATED_DESCRIPTION_END_MARKER}`)
  })

  it('scenario: Mixed content should only replace generated section', async () => {
    const mixedContent = `User notes here\n\n${GENERATED_DESCRIPTION_START_MARKER}\nOld AI summary\n${GENERATED_DESCRIPTION_END_MARKER}`
    const job = given.pullRequestJob({ prBody: mixedContent })
    given.diffWithFile('README.md', '@@ -1,1 +1,2 @@\n # Project\n+Adding more documentation.')
    given.aiFindsIssues('Review complete', [])
    vi.mocked(analyzePrModule.generatePrDescription).mockResolvedValue(`${GENERATED_DESCRIPTION_START_MARKER}\nUpdated AI summary\n${GENERATED_DESCRIPTION_END_MARKER}`)

    await when.processingTheJob(job)

    then.prDescriptionShouldBeUpdatedWith(`User notes here\n\n${GENERATED_DESCRIPTION_START_MARKER}\nUpdated AI summary\n${GENERATED_DESCRIPTION_END_MARKER}`)
  })

  it('scenario: Reply to a comment should trigger a reaction and a response', async () => {
    const job = given.replyJob(101)
    given.commentThread([
      { id: 101, user: { login: 'janusz-app[bot]' }, body: 'Fix this.', path: 'app.ts' },
      { id: 102, user: { login: 'user' }, body: 'Why?', in_reply_to_id: 101 },
    ])
    given.diffWithFile('app.ts', 'context')
    given.aiGeneratesReply('Because security.')

    await when.processingTheJob(job)

    then.reactionShouldBeAdded(101, 'eyes')
    then.replyShouldBePosted(101, 'Because security.')
  })

  it('scenario: No changes detected should skip the review', async () => {
    const job = given.pullRequestJob()
    given.emptyDiff()

    await when.processingTheJob(job)

    then.checkRunShouldBeCompletedWith('skipped')
  })

  it('scenario: AI Failure should result in check run failure and fallback comment (on last attempt)', async () => {
    const job = given.pullRequestJob({ attemptsMade: 3 })
    given.diffWithFile('app.ts', 'code')
    given.aiFails()

    try {
      await when.processingTheJob(job)
    } catch {
      // expected
    }

    await then.shouldThrowError(when.processingTheJob(job))
    then.checkRunShouldBeCompletedWith('failure')
    then.fallbackCommentShouldBePosted('Janusz could not complete the AI review')
  })
})
