import type { FileDiff } from '#shared/types/FileDiff'
import { GENERATED_DESCRIPTION_END_MARKER, GENERATED_DESCRIPTION_START_MARKER } from '#shared/constants/descriptionMarkers'
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

      expect(result).toBe(`${GENERATED_DESCRIPTION_START_MARKER}\n### Summary\nAdded new feature.\n${GENERATED_DESCRIPTION_END_MARKER}`)
    })
  })
})
