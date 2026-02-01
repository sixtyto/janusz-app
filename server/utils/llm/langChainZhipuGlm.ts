import type { z } from 'zod'
import { ServiceType } from '#shared/types/ServiceType'
import { ChatOpenAI } from '@langchain/openai'
import { useLogger } from '~~/server/utils/useLogger'

const logger = useLogger(ServiceType.worker)

interface ZhipuGlmOptions<T extends z.ZodTypeAny> {
  systemInstruction: string
  responseSchema: T
  temperature?: number
}

export async function askLangChainZhipuGlm<T extends z.ZodTypeAny>(
  userContent: string,
  options: ZhipuGlmOptions<T>,
  modelNames: string[],
): Promise<z.infer<T>> {
  const config = useRuntimeConfig()

  if (!config.zaiApiKey) {
    throw new Error('ZAI_API_KEY not configured')
  }

  for (const modelName of modelNames) {
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
      })

      const result = await structuredModel.invoke([
        ['system', options.systemInstruction],
        ['user', userContent],
      ])

      return result as z.infer<T>
    } catch (error: unknown) {
      logger.warn(`⚠️ Zhipu GLM (${modelName}) failed, trying next model...`, { error })
    }
  }

  throw new Error('All Zhipu GLM models failed via LangChain')
}
