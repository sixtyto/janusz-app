import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createMockLogger, setupRuntimeConfigMock } from '../helpers/testHelpers'

vi.mock('~~/server/utils/createLogger', () => ({
  createLogger: () => createMockLogger(),
}))

setupRuntimeConfigMock()

const mockGenerateContent = vi.fn()

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent,
    },
  })),
}))

// eslint-disable-next-line import/first
import { askGemini } from '~~/server/utils/aiService'

describe('aiService', () => {
  const testSchema = z.object({
    message: z.string(),
    count: z.number(),
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should call Gemini with correct configuration', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ message: 'Hello', count: 42 }),
    })

    await askGemini('Test prompt', {
      systemInstruction: 'Be helpful',
      responseSchema: testSchema,
      temperature: 0.5,
    })

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-3-flash-preview',
        // eslint-disable-next-line ts/no-unsafe-assignment
        contents: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            parts: [{ text: 'Test prompt' }],
          }),
        ]),
        // eslint-disable-next-line ts/no-unsafe-assignment
        config: expect.objectContaining({
          responseMimeType: 'application/json',
          systemInstruction: 'Be helpful',
          temperature: 0.5,
        }),
      }),
    )
  })

  it('should parse and validate response with Zod schema', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ message: 'Success', count: 100 }),
    })

    const result = await askGemini('Test', {
      systemInstruction: 'Test',
      responseSchema: testSchema,
    })

    expect(result).toEqual({ message: 'Success', count: 100 })
  })

  it('should fallback to next model on failure', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('Model overloaded'))
      .mockResolvedValueOnce({
        text: JSON.stringify({ message: 'Fallback', count: 1 }),
      })

    const result = await askGemini('Test', {
      systemInstruction: 'Test',
      responseSchema: testSchema,
    })

    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ message: 'Fallback', count: 1 })
  })

  it('should throw when all models fail', async () => {
    mockGenerateContent.mockRejectedValue(new Error('All models down'))

    await expect(
      askGemini('Test', {
        systemInstruction: 'Test',
        responseSchema: testSchema,
      }),
    ).rejects.toThrow('Gemini analysis failed')
  })

  it('should throw on empty response', async () => {
    mockGenerateContent.mockResolvedValue({ text: '' })

    await expect(
      askGemini('Test', {
        systemInstruction: 'Test',
        responseSchema: testSchema,
      }),
    ).rejects.toThrow()
  })

  it('should use custom model names when provided', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ message: 'Custom', count: 5 }),
    })

    await askGemini('Test', {
      systemInstruction: 'Test',
      responseSchema: testSchema,
      modelNames: ['custom-model-1'],
    })

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'custom-model-1',
      }),
    )
  })
})
