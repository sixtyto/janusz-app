import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { askAI } from '~~/server/utils/aiService'

vi.mock('~~/server/utils/useLogger', () => ({
  useLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}))

const { askAILangChain } = await import('~~/server/utils/langChainService')

vi.mock('~~/server/utils/langChainService', () => ({
  askAILangChain: vi.fn(),
}))

const mockGenerateContent = vi.fn()
const mockChatSend = vi.fn()

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent,
    },
  })),
}))

vi.mock('@openrouter/sdk', () => ({
  OpenRouter: vi.fn().mockImplementation(() => ({
    chat: {
      send: mockChatSend,
    },
  })),
}))

vi.mock('#app/nuxt', () => ({
  useRuntimeConfig: vi.fn(() => ({
    geminiApiKey: 'test-gemini-key',
    openrouterApiKey: 'test-openrouter-key',
  })),
}))

describe('aiService', () => {
  const testSchema = z.object({
    message: z.string(),
    count: z.number(),
  })

  beforeEach(() => {
    vi.clearAllMocks()
    // Make LangChain fail to test fallback to direct API
    vi.mocked(askAILangChain).mockRejectedValue(new Error('LangChain unavailable'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should parse and validate response with Zod schema', async () => {
    mockChatSend.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ message: 'Success', count: 100 }) } }],
    })

    const result = await askAI('Test', {
      systemInstruction: 'Test',
      responseSchema: testSchema,
    })

    expect(result).toEqual({ message: 'Success', count: 100 })
  })

  it('should fallback to next model on failure', async () => {
    vi.useFakeTimers()

    mockChatSend
      .mockRejectedValueOnce(new Error('Model 1 failed'))
      .mockRejectedValueOnce(new Error('Model 1 failed'))
      .mockRejectedValueOnce(new Error('Model 1 failed'))
      .mockRejectedValueOnce(new Error('Model 1 failed'))
      .mockRejectedValueOnce(new Error('Model 1 failed'))
      .mockRejectedValueOnce(new Error('Model 1 failed'))
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ message: 'Model 2 success', count: 1 }) } }],
      })

    const promise = askAI('Test', {
      systemInstruction: 'Test',
      responseSchema: testSchema,
    })

    // Fast-forward through all delays
    for (let i = 0; i < 7; i++) {
      await vi.runAllTimersAsync()
    }

    const result = await promise

    // 6 retry attempts + 1 successful attempt
    expect(mockChatSend).toHaveBeenCalledTimes(7)
    expect(result).toEqual({ message: 'Model 2 success', count: 1 })
  })
})

describe('langChain integration', () => {
  const testSchema = z.object({
    message: z.string(),
    count: z.number(),
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should use LangChain when available', async () => {
    vi.mocked(askAILangChain).mockResolvedValue({
      message: 'LangChain success',
      count: 42,
    })

    const result = await askAI('Test', {
      systemInstruction: 'Test',
      responseSchema: testSchema,
    })

    expect(result).toEqual({ message: 'LangChain success', count: 42 })
    expect(askAILangChain).toHaveBeenCalledTimes(1)
    expect(askAILangChain).toHaveBeenCalledWith('Test', {
      systemInstruction: 'Test',
      responseSchema: testSchema,
      temperature: undefined,
      preferredModel: undefined,
    })
  })

  it('should pass system instruction to LangChain', async () => {
    vi.mocked(askAILangChain).mockResolvedValue({
      message: 'System instruction received',
      count: 1,
    })

    const systemInstruction = 'You are a helpful code reviewer'

    await askAI('Test code', {
      systemInstruction,
      responseSchema: testSchema,
    })

    expect(askAILangChain).toHaveBeenCalledWith('Test code', {
      systemInstruction,
      responseSchema: testSchema,
      temperature: undefined,
      preferredModel: undefined,
    })
  })

  it('should respect preferred model in LangChain', async () => {
    vi.mocked(askAILangChain).mockResolvedValue({
      message: 'Preferred model used',
      count: 1,
    })

    await askAI('Test', {
      systemInstruction: 'Test',
      responseSchema: testSchema,
      preferredModel: 'gemini-2.5-flash',
    })

    expect(askAILangChain).toHaveBeenCalledWith('Test', {
      systemInstruction: 'Test',
      responseSchema: testSchema,
      temperature: undefined,
      preferredModel: 'gemini-2.5-flash',
    })
  })

  it('should fallback to direct API when LangChain fails', async () => {
    vi.mocked(askAILangChain).mockRejectedValue(new Error('LangChain failed'))

    mockChatSend.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ message: 'Direct API success', count: 1 }) } }],
    })

    const result = await askAI('Test', {
      systemInstruction: 'Test',
      responseSchema: testSchema,
    })

    expect(result).toEqual({ message: 'Direct API success', count: 1 })
    expect(askAILangChain).toHaveBeenCalledTimes(1)
    expect(mockChatSend).toHaveBeenCalledTimes(1)
  })

  it('should fallback through all LangChain models to direct API', async () => {
    vi.useFakeTimers()

    // LangChain fails
    vi.mocked(askAILangChain).mockRejectedValue(new Error('All LangChain models failed'))

    // First few OpenRouter attempts fail, then succeed
    mockChatSend
      .mockRejectedValueOnce(new Error('Attempt 1 failed'))
      .mockRejectedValueOnce(new Error('Attempt 2 failed'))
      .mockRejectedValueOnce(new Error('Attempt 3 failed'))
      .mockRejectedValueOnce(new Error('Attempt 4 failed'))
      .mockRejectedValueOnce(new Error('Attempt 5 failed'))
      .mockRejectedValueOnce(new Error('Attempt 6 failed'))
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ message: 'Fallback success', count: 1 }) } }],
      })

    const promise = askAI('Test', {
      systemInstruction: 'Test',
      responseSchema: testSchema,
    })

    // Fast-forward through all delays
    for (let i = 0; i < 7; i++) {
      await vi.runAllTimersAsync()
    }

    const result = await promise

    expect(result).toEqual({ message: 'Fallback success', count: 1 })
    expect(askAILangChain).toHaveBeenCalledTimes(1)
    expect(mockChatSend).toHaveBeenCalledTimes(7)
  })

  it('should pass temperature to LangChain', async () => {
    vi.mocked(askAILangChain).mockResolvedValue({
      message: 'Temperature set',
      count: 1,
    })

    await askAI('Test', {
      systemInstruction: 'Test',
      responseSchema: testSchema,
      temperature: 0.7,
    })

    expect(askAILangChain).toHaveBeenCalledWith('Test', {
      systemInstruction: 'Test',
      responseSchema: testSchema,
      temperature: 0.7,
      preferredModel: undefined,
    })
  })
})
