import { beforeEach, describe, expect, it, vi } from 'vitest'
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

vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback: () => unknown, _delay: number | undefined) => {
  callback()
  return 0 as unknown as NodeJS.Timeout
})

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
  })

  it('should call OpenRouter first, then fallback to Gemini', async () => {
    mockChatSend.mockRejectedValue(new Error('OpenRouter failed'))
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ message: 'Hello', count: 42 }),
    })

    const result = await askAI('Test prompt', {
      systemInstruction: 'Be helpful',
      responseSchema: testSchema,
      temperature: 0.5,
    })

    expect(result).toEqual({ message: 'Hello', count: 42 })
    expect(mockChatSend).toHaveBeenCalled()
    expect(mockGenerateContent).toHaveBeenCalled()
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

    const result = await askAI('Test', {
      systemInstruction: 'Test',
      responseSchema: testSchema,
    })

    expect(mockChatSend).toHaveBeenCalledTimes(7)
    expect(result).toEqual({ message: 'Model 2 success', count: 1 })
  })

  it('should throw when all models fail', async () => {
    mockChatSend.mockRejectedValue(new Error('All OpenRouter models down'))
    mockGenerateContent.mockRejectedValue(new Error('All Gemini models down'))

    await expect(
      askAI('Test', {
        systemInstruction: 'Test',
        responseSchema: testSchema,
      }),
    ).rejects.toThrow('AI analysis failed')
  })

  it('should throw on empty response', async () => {
    mockChatSend.mockResolvedValue({
      choices: [{ message: { content: '' } }],
    })

    await expect(
      askAI('Test', {
        systemInstruction: 'Test',
        responseSchema: testSchema,
      }),
    ).rejects.toThrow()
  })
})
