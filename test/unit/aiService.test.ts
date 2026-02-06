import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { askAI } from '~~/server/utils/aiService'

const {
  mockAskLangChainZhipuGlm,
  mockAskLangChainOpenRouter,
  mockAskLangChainGemini,
} = vi.hoisted(() => ({
  mockAskLangChainZhipuGlm: vi.fn(),
  mockAskLangChainOpenRouter: vi.fn(),
  mockAskLangChainGemini: vi.fn(),
}))

vi.mock('~~/server/utils/ai-service/langChainZhipuGlm', () => ({
  askLangChainZhipuGlm: mockAskLangChainZhipuGlm,
}))

vi.mock('~~/server/utils/useLogger', () => ({
  useLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}))

vi.mock('~~/server/utils/ai-service/langChainOpenRouter', () => ({
  askLangChainOpenRouter: mockAskLangChainOpenRouter,
}))

vi.mock('~~/server/utils/ai-service/langChainGemini', () => ({
  askLangChainGemini: mockAskLangChainGemini,
}))

function createAiResponse<T>(result: T, model = 'test-model') {
  return {
    result,
    usage: { inputTokens: 100, outputTokens: 50 },
    model,
    durationMs: 1000,
  }
}

describe('aiService', () => {
  const testSchema = z.object({
    message: z.string(),
    count: z.number(),
  })

  const defaultOptions = {
    systemInstruction: 'Test instruction',
    responseSchema: testSchema,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('primary provider (Zhipu GLM)', () => {
    it('should use Zhipu GLM as the first provider', async () => {
      mockAskLangChainZhipuGlm.mockResolvedValue(createAiResponse({
        message: 'Zhipu success',
        count: 42,
      }, 'glm-4'))

      const result = await askAI('Test prompt', defaultOptions)

      expect(result.result).toEqual({ message: 'Zhipu success', count: 42 })
      expect(result.successfulModel).toMatch(/^glm-/)
      expect(result.attempts).toHaveLength(1)
      expect(result.totalInputTokens).toBe(100)
      expect(result.totalOutputTokens).toBe(50)
      expect(mockAskLangChainZhipuGlm).toHaveBeenCalledTimes(1)
      expect(mockAskLangChainOpenRouter).not.toHaveBeenCalled()
      expect(mockAskLangChainGemini).not.toHaveBeenCalled()
    })

    it('should try all Zhipu GLM models before falling back', async () => {
      mockAskLangChainZhipuGlm
        .mockRejectedValueOnce(new Error('First GLM model failed'))
        .mockResolvedValueOnce(createAiResponse({ message: 'Second GLM model success', count: 1 }))

      const result = await askAI('Test prompt', defaultOptions)

      expect(result.result).toEqual({ message: 'Second GLM model success', count: 1 })
      expect(result.attempts).toHaveLength(2)
      expect(result.attempts[0]?.error).toBeDefined()
      expect(result.attempts[1]?.completedAt).toBeDefined()
      expect(mockAskLangChainZhipuGlm).toHaveBeenCalledTimes(2)
      expect(mockAskLangChainOpenRouter).not.toHaveBeenCalled()
    })
  })

  describe('fallback to OpenRouter', () => {
    it('should fallback to OpenRouter when all Zhipu GLM models fail', async () => {
      mockAskLangChainZhipuGlm.mockRejectedValue(new Error('GLM unavailable'))
      mockAskLangChainOpenRouter.mockResolvedValue(createAiResponse({
        message: 'OpenRouter success',
        count: 10,
      }))

      const result = await askAI('Test prompt', defaultOptions)

      expect(result.result).toEqual({ message: 'OpenRouter success', count: 10 })
      expect(result.attempts.length).toBeGreaterThan(2) // 2 failed GLM + 1 successful OpenRouter
      expect(mockAskLangChainZhipuGlm).toHaveBeenCalledTimes(2)
      expect(mockAskLangChainOpenRouter).toHaveBeenCalledTimes(1)
      expect(mockAskLangChainGemini).not.toHaveBeenCalled()
    })

    it('should try all OpenRouter models before falling back to Gemini', async () => {
      mockAskLangChainZhipuGlm.mockRejectedValue(new Error('GLM unavailable'))
      mockAskLangChainOpenRouter
        .mockRejectedValueOnce(new Error('First OpenRouter model failed'))
        .mockRejectedValueOnce(new Error('Second OpenRouter model failed'))
        .mockResolvedValueOnce(createAiResponse({ message: 'Third OpenRouter model success', count: 1 }))

      const result = await askAI('Test prompt', defaultOptions)

      expect(result.result).toEqual({ message: 'Third OpenRouter model success', count: 1 })
      expect(mockAskLangChainOpenRouter).toHaveBeenCalledTimes(3)
      expect(mockAskLangChainGemini).not.toHaveBeenCalled()
    })
  })

  describe('fallback to Gemini', () => {
    it('should fallback to Gemini when all Zhipu GLM and OpenRouter models fail', async () => {
      mockAskLangChainZhipuGlm.mockRejectedValue(new Error('GLM unavailable'))
      mockAskLangChainOpenRouter.mockRejectedValue(new Error('OpenRouter unavailable'))
      mockAskLangChainGemini.mockResolvedValue(createAiResponse({
        message: 'Gemini success',
        count: 5,
      }))

      const result = await askAI('Test prompt', defaultOptions)

      expect(result.result).toEqual({ message: 'Gemini success', count: 5 })
      expect(mockAskLangChainZhipuGlm).toHaveBeenCalledTimes(2)
      expect(mockAskLangChainOpenRouter).toHaveBeenCalledTimes(3)
      expect(mockAskLangChainGemini).toHaveBeenCalledTimes(1)
    })

    it('should try all Gemini models before throwing', async () => {
      mockAskLangChainZhipuGlm.mockRejectedValue(new Error('GLM unavailable'))
      mockAskLangChainOpenRouter.mockRejectedValue(new Error('OpenRouter unavailable'))
      mockAskLangChainGemini
        .mockRejectedValueOnce(new Error('First Gemini model failed'))
        .mockResolvedValueOnce(createAiResponse({ message: 'Second Gemini model success', count: 1 }))

      const result = await askAI('Test prompt', defaultOptions)

      expect(result.result).toEqual({ message: 'Second Gemini model success', count: 1 })
      expect(mockAskLangChainGemini).toHaveBeenCalledTimes(2)
    })
  })

  describe('complete failure', () => {
    it('should throw when all providers fail', async () => {
      mockAskLangChainZhipuGlm.mockRejectedValue(new Error('GLM failed'))
      mockAskLangChainOpenRouter.mockRejectedValue(new Error('OpenRouter failed'))
      mockAskLangChainGemini.mockRejectedValue(new Error('Gemini failed'))

      await expect(askAI('Test prompt', defaultOptions)).rejects.toThrow(
        'LangChain AI analysis failed: Gemini failed',
      )

      expect(mockAskLangChainZhipuGlm).toHaveBeenCalledTimes(2)
      expect(mockAskLangChainOpenRouter).toHaveBeenCalledTimes(3)
      expect(mockAskLangChainGemini).toHaveBeenCalledTimes(2)
    })
  })

  describe('preferred model selection', () => {
    it('should use preferred GLM model', async () => {
      mockAskLangChainZhipuGlm.mockResolvedValue(createAiResponse({
        message: 'Preferred GLM success',
        count: 1,
      }))

      const result = await askAI('Test prompt', {
        ...defaultOptions,
        preferredModel: 'glm-4.5-flash',
      })

      expect(result.result).toEqual({ message: 'Preferred GLM success', count: 1 })
      expect(mockAskLangChainZhipuGlm).toHaveBeenCalledWith(
        'Test prompt',
        expect.objectContaining({ preferredModel: 'glm-4.5-flash' }),
        ['glm-4.5-flash'],
      )
    })

    it('should use preferred OpenRouter model', async () => {
      mockAskLangChainOpenRouter.mockResolvedValue(createAiResponse({
        message: 'Preferred OpenRouter success',
        count: 1,
      }))

      const result = await askAI('Test prompt', {
        ...defaultOptions,
        preferredModel: 'upstage/solar-pro-3:free',
      })

      expect(result.result).toEqual({ message: 'Preferred OpenRouter success', count: 1 })
      expect(mockAskLangChainOpenRouter).toHaveBeenCalledWith(
        'Test prompt',
        expect.objectContaining({ preferredModel: 'upstage/solar-pro-3:free' }),
        ['upstage/solar-pro-3:free'],
      )
      expect(mockAskLangChainZhipuGlm).not.toHaveBeenCalled()
    })

    it('should use preferred Gemini model', async () => {
      mockAskLangChainGemini.mockResolvedValue(createAiResponse({
        message: 'Preferred Gemini success',
        count: 1,
      }))

      const result = await askAI('Test prompt', {
        ...defaultOptions,
        preferredModel: 'gemini-2.5-flash',
      })

      expect(result.result).toEqual({ message: 'Preferred Gemini success', count: 1 })
      expect(mockAskLangChainGemini).toHaveBeenCalledWith(
        'Test prompt',
        expect.objectContaining({ preferredModel: 'gemini-2.5-flash' }),
        ['gemini-2.5-flash'],
      )
      expect(mockAskLangChainZhipuGlm).not.toHaveBeenCalled()
      expect(mockAskLangChainOpenRouter).not.toHaveBeenCalled()
    })

    it('should fallback to default models when preferred model fails', async () => {
      mockAskLangChainGemini
        .mockRejectedValueOnce(new Error('Preferred Gemini failed'))
        .mockResolvedValueOnce(createAiResponse({ message: 'Fallback Gemini success', count: 1 }))
      mockAskLangChainZhipuGlm.mockRejectedValue(new Error('GLM unavailable'))
      mockAskLangChainOpenRouter.mockRejectedValue(new Error('OpenRouter unavailable'))

      const result = await askAI('Test prompt', {
        ...defaultOptions,
        preferredModel: 'gemini-2.5-flash',
      })

      expect(result.result).toEqual({ message: 'Fallback Gemini success', count: 1 })
      expect(mockAskLangChainGemini).toHaveBeenCalledTimes(2)
    })

    it('should use default model order when preferredModel is "default"', async () => {
      mockAskLangChainZhipuGlm.mockResolvedValue(createAiResponse({
        message: 'Default order success',
        count: 1,
      }))

      const result = await askAI('Test prompt', {
        ...defaultOptions,
        preferredModel: 'default',
      })

      expect(result.result).toEqual({ message: 'Default order success', count: 1 })
      expect(mockAskLangChainZhipuGlm).toHaveBeenCalledTimes(1)
    })

    it('should warn and use default order for unknown preferred model', async () => {
      mockAskLangChainZhipuGlm.mockResolvedValue(createAiResponse({
        message: 'Default order after unknown',
        count: 1,
      }))

      const result = await askAI('Test prompt', {
        ...defaultOptions,
        preferredModel: 'unknown-model-xyz',
      })

      expect(result.result).toEqual({ message: 'Default order after unknown', count: 1 })
      expect(mockAskLangChainZhipuGlm).toHaveBeenCalledTimes(1)
    })

    it('should detect qwen models as OpenRouter', async () => {
      mockAskLangChainOpenRouter.mockResolvedValue(createAiResponse({
        message: 'Qwen via OpenRouter',
        count: 1,
      }))

      const result = await askAI('Test prompt', {
        ...defaultOptions,
        preferredModel: 'qwen/qwen-2.5-coder-32b-instruct:free',
      })

      expect(result.result).toEqual({ message: 'Qwen via OpenRouter', count: 1 })
      expect(mockAskLangChainOpenRouter).toHaveBeenCalledWith(
        'Test prompt',
        expect.objectContaining({ preferredModel: 'qwen/qwen-2.5-coder-32b-instruct:free' }),
        ['qwen/qwen-2.5-coder-32b-instruct:free'],
      )
    })
  })

  describe('options forwarding', () => {
    it('should forward temperature to provider', async () => {
      mockAskLangChainZhipuGlm.mockResolvedValue(createAiResponse({
        message: 'Temperature forwarded',
        count: 1,
      }))

      await askAI('Test prompt', {
        ...defaultOptions,
        temperature: 0.7,
      })

      expect(mockAskLangChainZhipuGlm).toHaveBeenCalledWith(
        'Test prompt',
        expect.objectContaining({ temperature: 0.7 }),
        expect.any(Array),
      )
    })

    it('should forward system instruction to provider', async () => {
      mockAskLangChainZhipuGlm.mockResolvedValue(createAiResponse({
        message: 'System instruction received',
        count: 1,
      }))

      const customInstruction = 'You are a specialized code reviewer'

      await askAI('Test prompt', {
        systemInstruction: customInstruction,
        responseSchema: testSchema,
      })

      expect(mockAskLangChainZhipuGlm).toHaveBeenCalledWith(
        'Test prompt',
        expect.objectContaining({ systemInstruction: customInstruction }),
        expect.any(Array),
      )
    })
  })

  describe('attempt tracking', () => {
    it('should track failed attempts with error codes', async () => {
      mockAskLangChainZhipuGlm
        .mockRejectedValueOnce(new Error('rate limit exceeded'))
        .mockResolvedValueOnce(createAiResponse({ message: 'success', count: 1 }))

      const result = await askAI('Test prompt', defaultOptions)

      expect(result.attempts[0]?.error).toBe('rate_limit_exceeded')
      expect(result.attempts[0]?.failedAt).toBeDefined()
      expect(result.attempts[1]?.completedAt).toBeDefined()
    })

    it('should aggregate token usage across attempts', async () => {
      mockAskLangChainZhipuGlm.mockRejectedValue(new Error('failed'))
      mockAskLangChainOpenRouter.mockResolvedValue(createAiResponse({ message: 'success', count: 1 }))

      const result = await askAI('Test prompt', defaultOptions)

      expect(result.totalInputTokens).toBe(100)
      expect(result.totalOutputTokens).toBe(50)
    })
  })
})
