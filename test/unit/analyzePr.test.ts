import type { FileDiff } from '#shared/types/FileDiff'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { analyzePr, analyzeReply, generatePrDescription } from '~~/server/utils/analyzePr'
import { createMockLogger, setupRuntimeConfigMock } from '../helpers/testHelpers'

vi.mock('~~/server/utils/useLogger', () => ({
  useLogger: () => createMockLogger(),
}))

setupRuntimeConfigMock()

const mockAskAI = vi.fn()
vi.mock('~~/server/utils/aiService', () => ({
  askAI: (...args: unknown[]) => mockAskAI(...args),
}))

describe('analyzePr', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('analyzePr', () => {
    it('should return empty result when no diffs provided', async () => {
      const result = await analyzePr([])

      expect(result).toEqual({
        comments: [],
        summary: 'No reviewable changes found.',
      })
      expect(mockAskAI).not.toHaveBeenCalled()
    })

    it('should parse AI response and return comments', async () => {
      const diffs: FileDiff[] = [
        { filename: 'app.ts', patch: '@@ -1 +1 @@\n+code', status: 'modified' },
      ]

      mockAskAI.mockResolvedValue({
        summary: 'Found issues',
        comments: [
          {
            filename: 'app.ts',
            snippet: 'code',
            body: 'This needs improvement',
            severity: 'WARNING',
            confidence: 0.9,
          },
        ],
      })

      const result = await analyzePr(diffs)

      expect(result.summary).toBe('Found issues')
      expect(result.comments).toHaveLength(1)
      expect(result.comments[0].body).toBe('This needs improvement')
    })

    it('should strip markdown codeblocks from suggestions', async () => {
      const diffs: FileDiff[] = [
        { filename: 'app.ts', patch: 'patch', status: 'modified' },
      ]

      mockAskAI.mockResolvedValue({
        summary: 'Review complete',
        comments: [
          {
            filename: 'app.ts',
            snippet: 'code',
            body: 'Use this instead',
            suggestion: '```typescript\nconst x = 1\n```',
            severity: 'INFO',
            confidence: 0.8,
          },
        ],
      })

      const result = await analyzePr(diffs)

      expect(result.comments[0].suggestion).toBe('const x = 1')
    })

    it('should handle null comments array from AI', async () => {
      const diffs: FileDiff[] = [
        { filename: 'app.ts', patch: 'patch', status: 'modified' },
      ]

      mockAskAI.mockResolvedValue({
        summary: 'All good',
        comments: null,
      })

      const result = await analyzePr(diffs)

      expect(result.comments).toEqual([])
    })
  })

  describe('analyzeReply', () => {
    it('should return AI-generated reply', async () => {
      const threadHistory = [
        { author: 'bot', body: 'Fix this' },
        { author: 'dev', body: 'Why?' },
      ]

      mockAskAI.mockResolvedValue({
        body: 'Because of security reasons.',
      })

      const result = await analyzeReply(threadHistory, 'file.ts', 'patch content')

      expect(result).toBe('Because of security reasons.')
      expect(mockAskAI).toHaveBeenCalledWith(
        expect.stringContaining('THREAD HISTORY'),
        expect.objectContaining({ temperature: 0.3 }),
      )
    })
  })

  describe('generatePrDescription', () => {
    it('should generate description from diffs', async () => {
      const diffs: FileDiff[] = [
        { filename: 'feature.ts', patch: 'new feature code', status: 'added' },
      ]

      mockAskAI.mockResolvedValue({
        description: '### Summary\nAdded new feature.',
      })

      const result = await generatePrDescription(diffs)

      expect(result).toBe('### Summary\nAdded new feature.')
    })
  })
})
