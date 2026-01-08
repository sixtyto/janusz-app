import { ServiceType } from '#shared/types/ServiceType'
import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { useLogger } from '~~/server/utils/useLogger'

const logger = useLogger(ServiceType.worker)

interface GeminiOptions<T extends z.ZodTypeAny> {
  systemInstruction: string
  responseSchema: T
  temperature?: number
  modelNames?: string[]
}

export async function askGemini<T extends z.ZodTypeAny>(
  userContent: string,
  options: GeminiOptions<T>,
): Promise<z.infer<T>> {
  const config = useRuntimeConfig()
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey })

  const targetModels = options.modelNames || ['gemini-3-flash-preview', 'gemini-2.5-flash']

  let lastError: unknown

  for (const modelName of targetModels) {
    try {
      logger.info(`🤖 Sending request to Gemini (${modelName})...`)

      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [{ text: userContent }],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: z.toJSONSchema(options.responseSchema),
          systemInstruction: options.systemInstruction,
          temperature: options.temperature,
        },
      })

      const responseText = response.text

      if (!responseText) {
        throw new Error(`Empty response from ${modelName}`)
      }

      return options.responseSchema.parse(JSON.parse(responseText))
    } catch (error: unknown) {
      lastError = error
      logger.warn(`⚠️ Gemini (${modelName}) failed, trying fallback...`, { error })
    }
  }

  logger.error('💥 All Gemini models failed', { error: lastError })
  throw new Error(`Gemini analysis failed: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`)
}
