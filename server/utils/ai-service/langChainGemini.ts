import type { z } from 'zod'
import type { AIOptions } from '../aiService'
import type { AiResponse } from './aiTypes'
import { ServiceType } from '#shared/types/ServiceType'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { useLogger } from '~~/server/utils/useLogger'
import { createAiResponse } from './aiTypes'

const logger = useLogger(ServiceType.worker)

export async function askLangChainGemini<T extends z.ZodTypeAny>(
  userContent: string,
  options: AIOptions<T>,
  modelNames: string[],
): Promise<AiResponse<z.infer<T>>> {
  const config = useRuntimeConfig()

  if (!config.geminiApiKey) {
    throw new Error('GEMINI_API_KEY not configured')
  }

  for (const modelName of modelNames) {
    const startTime = Date.now()
    try {
      logger.info(`🤖 Sending request to Gemini (${modelName}) via LangChain...`)

      const model = new ChatGoogleGenerativeAI({
        apiKey: config.geminiApiKey,
        model: modelName,
        temperature: options.temperature ?? 0.1,
        maxRetries: 6,
      })

      const structuredModel = model.withStructuredOutput(options.responseSchema, {
        includeRaw: true,
      })

      const response = await structuredModel.invoke([
        ['system', options.systemInstruction],
        ['user', userContent],
      ])

      const durationMs = Date.now() - startTime

      return createAiResponse({
        parsed: response.parsed as z.infer<T>,
        raw: response.raw,
        modelName,
        durationMs,
      })
    } catch (error: unknown) {
      logger.warn(`⚠️ Gemini (${modelName}) failed, trying next model...`, { error })
    }
  }

  throw new Error('All Gemini models failed via LangChain')
}
