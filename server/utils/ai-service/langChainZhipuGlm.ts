import type { z } from 'zod'
import type { AIOptions } from '../aiService'
import type { AiResponse } from './aiTypes'
import { ServiceType } from '#shared/types/ServiceType'
import { ChatOpenAI } from '@langchain/openai'
import { useLogger } from '~~/server/utils/useLogger'
import { createAiResponse } from './aiTypes'

const logger = useLogger(ServiceType.worker)

export async function askLangChainZhipuGlm<T extends z.ZodTypeAny>(
  userContent: string,
  options: AIOptions<T>,
  modelNames: string[],
): Promise<AiResponse<z.infer<T>>> {
  const config = useRuntimeConfig()

  if (!config.zaiApiKey) {
    throw new Error('ZAI_API_KEY not configured')
  }

  for (const modelName of modelNames) {
    const startTime = Date.now()
    try {
      logger.info(`🤖 Sending request to Zhipu GLM (${modelName}) via LangChain...`)

      const model = new ChatOpenAI({
        apiKey: config.zaiApiKey,
        modelName,
        temperature: options.temperature ?? 0.1,
        timeout: 120000,
        maxRetries: 6,
        configuration: {
          baseURL: 'https://api.z.ai/api/paas/v4/',
        },
      })

      const structuredModel = model.withStructuredOutput(options.responseSchema, {
        method: 'functionCalling',
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
      logger.warn(`⚠️ Zhipu GLM (${modelName}) failed, trying next model...`, { error })
    }
  }

  throw new Error('All Zhipu GLM models failed via LangChain')
}
