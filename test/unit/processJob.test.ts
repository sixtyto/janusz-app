import {beforeEach, describe, expect, test, vi} from 'vitest'
import {JobType} from '#shared/types/JobType'
import {processJob} from '~~/server/utils/processJob'
import * as analyzePrModule from '~~/server/utils/analyzePr'
import * as githubClientModule from '~~/server/utils/createGitHubClient'
import * as provisionRepoModule from '~~/server/utils/provisionRepo'

vi.mock('~~/server/utils/analyzePr')
vi.mock('~~/server/utils/createGitHubClient')
vi.mock('~~/server/utils/provisionRepo')
vi.mock('~~/server/utils/selectContextFiles', () => ({
    selectContextFiles: vi.fn().mockResolvedValue([])
}))
vi.mock('~~/server/utils/createLogger', () => ({
    createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    })
}))

describe('Feature: Pull Request Review', () => {
    const mockGitHub = {
        getPrDiff: vi.fn(),
        postReview: vi.fn(),
        createCheckRun: vi.fn().mockResolvedValue(999),
        updateCheckRun: vi.fn(),
        getExistingReviewComments: vi.fn().mockResolvedValue(new Set()),
        getBotUser: vi.fn().mockResolvedValue({slug: 'janusz-app'}),
        getToken: vi.fn().mockResolvedValue('fake-token'),
        updatePullRequest: vi.fn(),
        listReviewCommentsForPr: vi.fn(),
        createReactionForReviewComment: vi.fn(),
        createReplyForReviewComment: vi.fn(),
        postFallbackComment: vi.fn(),
    }

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(githubClientModule.createGitHubClient).mockReturnValue(mockGitHub as any)
        vi.mocked(provisionRepoModule.provisionRepo).mockResolvedValue({
            index: [],
            repoDir: '/tmp/fake-repo',
            cleanup: vi.fn().mockResolvedValue(undefined),
        } as any)
    })

    const given = {
        pullRequestJob: (overrides: any = {}) => {
            const {attemptsMade, ...dataOverrides} = overrides
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
            } as any
        },
        replyJob: (commentId: number, overrides = {}) => {
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
            } as any
        },
        diffWithFile: (filename: string, patch: string) => {
            mockGitHub.getPrDiff.mockResolvedValue([{filename, patch, status: 'modified'}])
        },
        emptyDiff: () => {
            mockGitHub.getPrDiff.mockResolvedValue([])
        },
        aiFindsIssues: (summary: string, comments: any[]) => {
            vi.mocked(analyzePrModule.analyzePr).mockResolvedValue({summary, comments})
        },
        commentThread: (comments: any[]) => {
            mockGitHub.listReviewCommentsForPr.mockResolvedValue(comments)
        },
        aiGeneratesReply: (replyBody: string) => {
            vi.mocked(analyzePrModule.analyzeReply).mockResolvedValue(replyBody)
        },
        aiFails: () => {
            vi.mocked(analyzePrModule.analyzePr).mockRejectedValue(new Error('AI Explosion'))
        }
    }

    const when = {
        processingTheJob: async (job: any) => {
            await processJob(job)
        }
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
                        body: expect.stringContaining(expectedCommentBody)
                    })
                ])
            )
        },
        checkRunShouldBeCompletedWith: (conclusion: string) => {
            expect(mockGitHub.updateCheckRun).toHaveBeenCalledWith(
                'owner',
                'repo',
                expect.any(Number),
                conclusion,
                expect.any(Object)
            )
        },
        prDescriptionShouldBeUpdatedWith: (body: string) => {
            expect(mockGitHub.updatePullRequest).toHaveBeenCalledWith(
                'owner',
                'repo',
                42,
                body
            )
        },
        reactionShouldBeAdded: (commentId: number, content: string) => {
            if (mockGitHub.createReactionForReviewComment) {
                expect(mockGitHub.createReactionForReviewComment).toHaveBeenCalledWith('owner', 'repo', commentId, content)
            }
        },
        replyShouldBePosted: (commentId: number, body: string) => {
            expect(mockGitHub.createReplyForReviewComment).toHaveBeenCalledWith('owner', 'repo', 42, commentId, body)
        },
        fallbackCommentShouldBePosted: (bodySnippet: string) => {
            expect(mockGitHub.postFallbackComment).toHaveBeenCalledWith(
                'owner',
                'repo',
                42,
                expect.stringContaining(bodySnippet)
            )
        },
        shouldThrowError: async (promise: Promise<any>) => {
            await expect(promise).rejects.toThrow()
        }
    }

    test('Scenario: AI finds a critical bug in the code', async () => {
        const job = given.pullRequestJob()
        given.diffWithFile('app.ts', '@@ -1,1 +1,1 @@\n-old\n+console.log(eval("user_input"));')
        given.aiFindsIssues('Found a critical vulnerability', [
            {
                filename: 'app.ts',
                snippet: 'console.log(eval("user_input"));',
                body: 'Potential Remote Code Execution via eval()',
                severity: 'CRITICAL',
                confidence: 1.0
            }
        ])

        await when.processingTheJob(job)

        then.reviewShouldBePostedWith('Found a critical vulnerability', 'Potential Remote Code Execution')
        then.checkRunShouldBeCompletedWith('neutral')
    })

    test('Scenario: Empty PR description should be automatically generated', async () => {
        const job = given.pullRequestJob({prBody: ''})
        given.diffWithFile('README.md', '@@ -1,1 +1,2 @@\n # Project\n+Adding more documentation.')
        given.aiFindsIssues('Review complete', [])
        vi.mocked(analyzePrModule.generatePrDescription).mockResolvedValue('### 📝 Description\nGenerated summary.')

        await when.processingTheJob(job)

        then.prDescriptionShouldBeUpdatedWith('### 📝 Description\nGenerated summary.')
    })

    test('Scenario: Reply to a comment should trigger a reaction and a response', async () => {
        const job = given.replyJob(101)
        given.commentThread([
            {id: 101, user: {login: 'janusz-app[bot]'}, body: 'Fix this.', path: 'app.ts'},
            {id: 102, user: {login: 'user'}, body: 'Why?', in_reply_to_id: 101}
        ])
        given.diffWithFile('app.ts', 'context')
        given.aiGeneratesReply('Because security.')

        await when.processingTheJob(job)

        then.reactionShouldBeAdded(101, 'eyes')
        then.replyShouldBePosted(101, 'Because security.')
    })

    test('Scenario: No changes detected should skip the review', async () => {
        const job = given.pullRequestJob()
        given.emptyDiff()

        await when.processingTheJob(job)

        then.checkRunShouldBeCompletedWith('skipped')
    })

    test('Scenario: AI Failure should result in check run failure and fallback comment (on last attempt)', async () => {
        const job = given.pullRequestJob({attemptsMade: 3})
        given.diffWithFile('app.ts', 'code')
        given.aiFails()

        try {
            await when.processingTheJob(job)
        } catch (e) {
            // expected
        }

        then.checkRunShouldBeCompletedWith('failure')
        then.fallbackCommentShouldBePosted('Janusz could not complete the AI review')
    })
})
