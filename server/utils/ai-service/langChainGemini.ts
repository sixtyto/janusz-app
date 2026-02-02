import type { z } from 'zod'
import type { AIOptions } from '../aiService'
import { ServiceType } from '#shared/types/ServiceType'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { useLogger } from '~~/server/utils/useLogger'

const logger = useLogger(ServiceType.worker)

export async function askLangChainGemini<T extends z.ZodTypeAny>(
  userContent: string,
  options: AIOptions<T>,
  modelNames: string[],
): Promise<z.infer<T>> {
  const config = useRuntimeConfig()

  if (!config.geminiApiKey) {
    throw new Error('GEMINI_API_KEY not configured')
  }

  for (const modelName of modelNames) {
    try {
      logger.info(`🤖 Sending request to Gemini (${modelName}) via LangChain...`)

      const model = new ChatGoogleGenerativeAI({
        apiKey: config.geminiApiKey,
        model: modelName,
        temperature: options.temperature ?? 0.1,
        maxRetries: 6,
      })

      const structuredModel = model.withStructuredOutput(options.responseSchema)

      const result = await structuredModel.invoke([
        ['system', options.systemInstruction],
        ['user', userContent],
      ])

      return result as z.infer<T>
    } catch (error: unknown) {
      logger.warn(`⚠️ Gemini (${modelName}) failed, trying next model...`, { error })
    }
  }

  throw new Error('All Gemini models failed via LangChain')
}
