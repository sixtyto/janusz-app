import type { z } from 'zod'
import { ServiceType } from '#shared/types/ServiceType'
import { ChatOpenAI } from '@langchain/openai'
import { isRetryableError } from '~~/server/utils/aiService'
import { useLogger } from '~~/server/utils/useLogger'

const logger = useLogger(ServiceType.worker)
const RETRY_ATTEMPTS = 6

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

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
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      try {
        if (attempt > 0) {
          logger.info(`🔄 Retry ${attempt}/${RETRY_ATTEMPTS} for Zhipu GLM ${modelName} after 1s delay...`)
          await delay(1000)
        }

        logger.info(`🤖 Sending request to Zhipu GLM (${modelName}) via LangChain...`)

        const model = new ChatOpenAI({
          apiKey: config.zaiApiKey,
          modelName,
          temperature: options.temperature ?? 0.1,
          configuration: {
            baseURL: 'https://api.z.ai/api/paas/v4/',
          },
        })

        const structuredModel = model.withStructuredOutput(options.responseSchema, {
          //   functionCalling is used because z.ai does not support jsonSchema
          method: 'functionCalling',
        })

        const result = await structuredModel.invoke([
          ['system', options.systemInstruction],
          ['user', userContent],
        ])

        return result as z.infer<T>
      } catch (error: unknown) {
        const isLastAttempt = attempt === RETRY_ATTEMPTS - 1
        const shouldRetry = isRetryableError(error)

        if (!shouldRetry) {
          logger.warn(`⚠️ Zhipu GLM (${modelName}) encountered non-retryable error, trying next model...`, { error })
          break
        }

        if (isLastAttempt) {
          logger.warn(`⚠️ Zhipu GLM (${modelName}) failed after ${RETRY_ATTEMPTS} attempts, trying next model...`, { error })
        } else {
          logger.warn(`⚠️ Zhipu GLM (${modelName}) attempt ${attempt + 1} failed, retrying...`, { error })
        }
      }
    }
  }

  throw new Error(`All Zhipu GLM models failed via LangChain`)
}
