import type { FileDiff } from '#shared/types/FileDiff'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { analyzePr, analyzeReply, generatePrDescription } from '~~/server/utils/analyzePr'

import { setupRuntimeConfigMock } from '../helpers/testHelpers'

vi.mock('~~/server/utils/useLogger', () => ({
  useLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

const mockAnalyzeWithMultiAgent = vi.fn()
vi.mock('~~/server/utils/multiAgentReview', () => ({
  analyzeWithMultiAgent: (...args: unknown[]) => mockAnalyzeWithMultiAgent(...args),
}))

const mockAskAI = vi.fn()
vi.mock('~~/server/utils/aiService', () => ({
  askAI: (...args: unknown[]) => mockAskAI(...args),
}))

setupRuntimeConfigMock()

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
      expect(mockAnalyzeWithMultiAgent).not.toHaveBeenCalled()
      expect(mockAskAI).not.toHaveBeenCalled()
    })

    it('should use multi-agent review by default', async () => {
      const diffs: FileDiff[] = [
        { filename: 'app.ts', patch: '@@ -1 +1 @@\n+code', status: 'modified' },
      ]

      mockAnalyzeWithMultiAgent.mockResolvedValue({
        summary: 'Found issues via multi-agent',
        comments: [
          {
            filename: 'app.ts',
            snippet: 'code',
            body: 'This needs improvement',
            severity: 'HIGH',
            confidence: 0.9,
          },
        ],
      })

      const result = await analyzePr(diffs)

      expect(mockAnalyzeWithMultiAgent).toHaveBeenCalled()
      expect(mockAskAI).not.toHaveBeenCalled()
      expect(result.summary).toBe('Found issues via multi-agent')
      expect(result.comments).toHaveLength(1)
      expect(result.comments[0]?.body).toBe('This needs improvement')
    })

    it('should fall back to single-agent when multi-agent fails', async () => {
      const diffs: FileDiff[] = [
        { filename: 'app.ts', patch: '@@ -1 +1 @@\n+code', status: 'modified' },
      ]

      mockAnalyzeWithMultiAgent.mockRejectedValue(new Error('Multi-agent failed'))
      mockAskAI.mockResolvedValue({
        summary: 'Found issues via single-agent',
        comments: [
          {
            filename: 'app.ts',
            snippet: 'code',
            body: 'Fallback comment',
            severity: 'MEDIUM',
            confidence: 0.8,
          },
        ],
      })

      const result = await analyzePr(diffs)

      expect(mockAnalyzeWithMultiAgent).toHaveBeenCalled()
      expect(mockAskAI).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          systemInstruction: expect.stringContaining('Principal Software Engineer'),
        }),
      )
      expect(result.summary).toBe('Found issues via single-agent')
    })

    it('should use single-agent when custom prompt is provided', async () => {
      const diffs: FileDiff[] = [
        { filename: 'app.ts', patch: 'patch', status: 'modified' },
      ]

      mockAskAI.mockResolvedValue({
        summary: 'Custom review',
        comments: [
          {
            filename: 'app.ts',
            snippet: 'code',
            body: 'Custom comment',
            suggestion: '```typescript\nconst x = 1\n```',
            severity: 'LOW',
            confidence: 0.8,
          },
        ],
      })

      const result = await analyzePr(diffs, {}, 'Custom system prompt')

      expect(mockAnalyzeWithMultiAgent).not.toHaveBeenCalled()
      expect(mockAskAI).toHaveBeenCalled()
      expect(result.comments[0]?.suggestion).toBe('const x = 1')
    })

    it('should handle null comments array from AI', async () => {
      const diffs: FileDiff[] = [
        { filename: 'app.ts', patch: 'patch', status: 'modified' },
      ]

      mockAskAI.mockResolvedValue({
        summary: 'All good',
        comments: null,
      })

      const result = await analyzePr(diffs, {}, 'Custom prompt')

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

      expect(result).toBe('<!-- janusz-generated-description-start -->\n### Summary\nAdded new feature.\n<!-- janusz-generated-description-end -->')
    })
  })
})
