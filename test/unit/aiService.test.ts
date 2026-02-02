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
      mockAskLangChainZhipuGlm.mockResolvedValue({
        message: 'Zhipu success',
        count: 42,
      })

      const result = await askAI('Test prompt', defaultOptions)

      expect(result).toEqual({ message: 'Zhipu success', count: 42 })
      expect(mockAskLangChainZhipuGlm).toHaveBeenCalledTimes(1)
      expect(mockAskLangChainOpenRouter).not.toHaveBeenCalled()
      expect(mockAskLangChainGemini).not.toHaveBeenCalled()
    })

    it('should try all Zhipu GLM models before falling back', async () => {
      mockAskLangChainZhipuGlm
        .mockRejectedValueOnce(new Error('First GLM model failed'))
        .mockResolvedValueOnce({ message: 'Second GLM model success', count: 1 })

      const result = await askAI('Test prompt', defaultOptions)

      expect(result).toEqual({ message: 'Second GLM model success', count: 1 })
      expect(mockAskLangChainZhipuGlm).toHaveBeenCalledTimes(2)
      expect(mockAskLangChainOpenRouter).not.toHaveBeenCalled()
    })
  })

  describe('fallback to OpenRouter', () => {
    it('should fallback to OpenRouter when all Zhipu GLM models fail', async () => {
      mockAskLangChainZhipuGlm.mockRejectedValue(new Error('GLM unavailable'))
      mockAskLangChainOpenRouter.mockResolvedValue({
        message: 'OpenRouter success',
        count: 10,
      })

      const result = await askAI('Test prompt', defaultOptions)

      expect(result).toEqual({ message: 'OpenRouter success', count: 10 })
      expect(mockAskLangChainZhipuGlm).toHaveBeenCalledTimes(2) // 2 GLM models
      expect(mockAskLangChainOpenRouter).toHaveBeenCalledTimes(1)
      expect(mockAskLangChainGemini).not.toHaveBeenCalled()
    })

    it('should try all OpenRouter models before falling back to Gemini', async () => {
      mockAskLangChainZhipuGlm.mockRejectedValue(new Error('GLM unavailable'))
      mockAskLangChainOpenRouter
        .mockRejectedValueOnce(new Error('First OpenRouter model failed'))
        .mockRejectedValueOnce(new Error('Second OpenRouter model failed'))
        .mockResolvedValueOnce({ message: 'Third OpenRouter model success', count: 1 })

      const result = await askAI('Test prompt', defaultOptions)

      expect(result).toEqual({ message: 'Third OpenRouter model success', count: 1 })
      expect(mockAskLangChainOpenRouter).toHaveBeenCalledTimes(3)
      expect(mockAskLangChainGemini).not.toHaveBeenCalled()
    })
  })

  describe('fallback to Gemini', () => {
    it('should fallback to Gemini when all Zhipu GLM and OpenRouter models fail', async () => {
      mockAskLangChainZhipuGlm.mockRejectedValue(new Error('GLM unavailable'))
      mockAskLangChainOpenRouter.mockRejectedValue(new Error('OpenRouter unavailable'))
      mockAskLangChainGemini.mockResolvedValue({
        message: 'Gemini success',
        count: 5,
      })

      const result = await askAI('Test prompt', defaultOptions)

      expect(result).toEqual({ message: 'Gemini success', count: 5 })
      expect(mockAskLangChainZhipuGlm).toHaveBeenCalledTimes(2) // 2 GLM models
      expect(mockAskLangChainOpenRouter).toHaveBeenCalledTimes(3) // 3 OpenRouter models
      expect(mockAskLangChainGemini).toHaveBeenCalledTimes(1)
    })

    it('should try all Gemini models before throwing', async () => {
      mockAskLangChainZhipuGlm.mockRejectedValue(new Error('GLM unavailable'))
      mockAskLangChainOpenRouter.mockRejectedValue(new Error('OpenRouter unavailable'))
      mockAskLangChainGemini
        .mockRejectedValueOnce(new Error('First Gemini model failed'))
        .mockResolvedValueOnce({ message: 'Second Gemini model success', count: 1 })

      const result = await askAI('Test prompt', defaultOptions)

      expect(result).toEqual({ message: 'Second Gemini model success', count: 1 })
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
      mockAskLangChainZhipuGlm.mockResolvedValue({
        message: 'Preferred GLM success',
        count: 1,
      })

      const result = await askAI('Test prompt', {
        ...defaultOptions,
        preferredModel: 'glm-4.5-flash',
      })

      expect(result).toEqual({ message: 'Preferred GLM success', count: 1 })
      expect(mockAskLangChainZhipuGlm).toHaveBeenCalledWith(
        'Test prompt',
        expect.objectContaining({ preferredModel: 'glm-4.5-flash' }),
        ['glm-4.5-flash'],
      )
    })

    it('should use preferred OpenRouter model', async () => {
      mockAskLangChainOpenRouter.mockResolvedValue({
        message: 'Preferred OpenRouter success',
        count: 1,
      })

      const result = await askAI('Test prompt', {
        ...defaultOptions,
        preferredModel: 'upstage/solar-pro-3:free',
      })

      expect(result).toEqual({ message: 'Preferred OpenRouter success', count: 1 })
      expect(mockAskLangChainOpenRouter).toHaveBeenCalledWith(
        'Test prompt',
        expect.objectContaining({ preferredModel: 'upstage/solar-pro-3:free' }),
        ['upstage/solar-pro-3:free'],
      )
      expect(mockAskLangChainZhipuGlm).not.toHaveBeenCalled()
    })

    it('should use preferred Gemini model', async () => {
      mockAskLangChainGemini.mockResolvedValue({
        message: 'Preferred Gemini success',
        count: 1,
      })

      const result = await askAI('Test prompt', {
        ...defaultOptions,
        preferredModel: 'gemini-2.5-flash',
      })

      expect(result).toEqual({ message: 'Preferred Gemini success', count: 1 })
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
        .mockResolvedValueOnce({ message: 'Fallback Gemini success', count: 1 })
      mockAskLangChainZhipuGlm.mockRejectedValue(new Error('GLM unavailable'))
      mockAskLangChainOpenRouter.mockRejectedValue(new Error('OpenRouter unavailable'))

      const result = await askAI('Test prompt', {
        ...defaultOptions,
        preferredModel: 'gemini-2.5-flash',
      })

      expect(result).toEqual({ message: 'Fallback Gemini success', count: 1 })
      // First call is for preferred model, then fallback through all providers
      expect(mockAskLangChainGemini).toHaveBeenCalledTimes(2)
    })

    it('should use default model order when preferredModel is "default"', async () => {
      mockAskLangChainZhipuGlm.mockResolvedValue({
        message: 'Default order success',
        count: 1,
      })

      const result = await askAI('Test prompt', {
        ...defaultOptions,
        preferredModel: 'default',
      })

      expect(result).toEqual({ message: 'Default order success', count: 1 })
      expect(mockAskLangChainZhipuGlm).toHaveBeenCalledTimes(1)
    })

    it('should warn and use default order for unknown preferred model', async () => {
      mockAskLangChainZhipuGlm.mockResolvedValue({
        message: 'Default order after unknown',
        count: 1,
      })

      const result = await askAI('Test prompt', {
        ...defaultOptions,
        preferredModel: 'unknown-model-xyz',
      })

      expect(result).toEqual({ message: 'Default order after unknown', count: 1 })
      expect(mockAskLangChainZhipuGlm).toHaveBeenCalledTimes(1)
    })

    it('should detect qwen models as OpenRouter', async () => {
      mockAskLangChainOpenRouter.mockResolvedValue({
        message: 'Qwen via OpenRouter',
        count: 1,
      })

      const result = await askAI('Test prompt', {
        ...defaultOptions,
        preferredModel: 'qwen/qwen-2.5-coder-32b-instruct:free',
      })

      expect(result).toEqual({ message: 'Qwen via OpenRouter', count: 1 })
      expect(mockAskLangChainOpenRouter).toHaveBeenCalledWith(
        'Test prompt',
        expect.objectContaining({ preferredModel: 'qwen/qwen-2.5-coder-32b-instruct:free' }),
        ['qwen/qwen-2.5-coder-32b-instruct:free'],
      )
    })
  })

  describe('options forwarding', () => {
    it('should forward temperature to provider', async () => {
      mockAskLangChainZhipuGlm.mockResolvedValue({
        message: 'Temperature forwarded',
        count: 1,
      })

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
      mockAskLangChainZhipuGlm.mockResolvedValue({
        message: 'System instruction received',
        count: 1,
      })

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
})
