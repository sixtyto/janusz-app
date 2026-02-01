import type { z } from 'zod'
import { ServiceType } from '#shared/types/ServiceType'
import { ChatOpenAI } from '@langchain/openai'
import { useLogger } from '~~/server/utils/useLogger'

const logger = useLogger(ServiceType.worker)

interface OpenRouterOptions<T extends z.ZodTypeAny> {
  systemInstruction: string
  responseSchema: T
  temperature?: number
}

export async function askLangChainOpenRouter<T extends z.ZodTypeAny>(
  userContent: string,
  options: OpenRouterOptions<T>,
  modelNames: string[],
): Promise<z.infer<T>> {
  const config = useRuntimeConfig()

  if (!config.openrouterApiKey) {
    throw new Error('OPENROUTER_API_KEY not configured')
  }

  for (const modelName of modelNames) {
    try {
      logger.info(`🤖 Sending request to OpenRouter (${modelName}) via LangChain...`)

      const model = new ChatOpenAI({
        apiKey: config.openrouterApiKey,
        modelName,
        temperature: options.temperature ?? 0.1,
        timeout: 120000,
        maxRetries: 6,
      })

      const structuredModel = model.withStructuredOutput(options.responseSchema, {
        method: 'jsonSchema',
      })

      const result = await structuredModel.invoke([
        ['system', options.systemInstruction],
        ['user', userContent],
      ])

      return result as z.infer<T>
    } catch (error: unknown) {
      logger.warn(`⚠️ OpenRouter (${modelName}) failed, trying next model...`, { error })
    }
  }

  throw new Error('All OpenRouter models failed via LangChain')
}
