import type { z } from 'zod'
import { ServiceType } from '#shared/types/ServiceType'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { isRetryableError } from '~~/server/utils/aiService'
import { useLogger } from '~~/server/utils/useLogger'

const logger = useLogger(ServiceType.worker)
const RETRY_ATTEMPTS = 6

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

interface GeminiOptions<T extends z.ZodTypeAny> {
  systemInstruction: string
  responseSchema: T
  temperature?: number
}

export async function askLangChainGemini<T extends z.ZodTypeAny>(
  userContent: string,
  options: GeminiOptions<T>,
  modelNames: string[],
): Promise<z.infer<T>> {
  const config = useRuntimeConfig()

  if (!config.geminiApiKey) {
    throw new Error('GEMINI_API_KEY not configured')
  }

  for (const modelName of modelNames) {
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      try {
        if (attempt > 0) {
          logger.info(`🔄 Retry ${attempt}/${RETRY_ATTEMPTS} for Gemini ${modelName} after 1s delay...`)
          await delay(1000)
        }

        logger.info(`🤖 Sending request to Gemini (${modelName}) via LangChain...`)

        const model = new ChatGoogleGenerativeAI({
          apiKey: config.geminiApiKey,
          model: modelName,
          temperature: options.temperature ?? 0.1,
        })

        const structuredModel = model.withStructuredOutput(options.responseSchema)

        const result = await structuredModel.invoke([
          ['system', options.systemInstruction],
          ['user', userContent],
        ])

        return result as z.infer<T>
      } catch (error: unknown) {
        const isLastAttempt = attempt === RETRY_ATTEMPTS - 1
        const shouldRetry = isRetryableError(error)

        if (!shouldRetry) {
          logger.warn(`⚠️ Gemini (${modelName}) encountered non-retryable error, trying next model...`, { error })
          break
        }

        if (isLastAttempt) {
          logger.warn(`⚠️ Gemini (${modelName}) failed after ${RETRY_ATTEMPTS} attempts, trying next model...`, { error })
        } else {
          logger.warn(`⚠️ Gemini (${modelName}) attempt ${attempt + 1} failed, retrying...`, { error })
        }
      }
    }
  }

  throw new Error(`All Gemini models failed via LangChain`)
}
