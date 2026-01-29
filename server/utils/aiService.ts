import { AI_MODELS } from '#shared/types/aiModels'
import { ServiceType } from '#shared/types/ServiceType'
import { GoogleGenAI } from '@google/genai'
import { OpenRouter } from '@openrouter/sdk'
import { z } from 'zod'
import { askAILangChain } from '~~/server/utils/langChainService'
import { useLogger } from '~~/server/utils/useLogger'

const RETRY_ATTEMPTS = 6

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase()

    if (errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('unauthorized') || errorMessage.includes('forbidden')) {
      return false
    }

    if (errorMessage.includes('400') || errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      return false
    }

    if (errorMessage.includes('429') || errorMessage.includes('rate limit') || errorMessage.includes('timeout') || errorMessage.includes('network') || errorMessage.includes('econnrefused') || errorMessage.includes('etimedout')) {
      return true
    }
  }

  return true
}

const logger = useLogger(ServiceType.worker)

interface AIOptions<T extends z.ZodTypeAny> {
  systemInstruction: string
  responseSchema: T
  temperature?: number
  preferredModel?: string
}

async function askOpenRouter<T extends z.ZodTypeAny>(
  userContent: string,
  options: AIOptions<T>,
  modelNames: string[],
): Promise<z.infer<T>> {
  const config = useRuntimeConfig()

  if (!config.openrouterApiKey) {
    throw new Error('OPENROUTER_API_KEY not configured')
  }

  const openRouter = new OpenRouter({
    apiKey: config.openrouterApiKey,
  })

  for (const modelName of modelNames) {
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      try {
        if (attempt > 0) {
          logger.info(`🔄 Retry ${attempt}/${RETRY_ATTEMPTS} for ${modelName} after 1s delay...`)
          await delay(1000)
        }

        logger.info(`🤖 Sending request to OpenRouter (${modelName})...`)

        const response = await openRouter.chat.send({
          model: modelName,
          messages: [
            { role: 'system', content: options.systemInstruction },
            { role: 'user', content: userContent },
          ],
          responseFormat: {
            type: 'json_schema',
            jsonSchema: {
              name: 'response',
              strict: true,
              schema: z.toJSONSchema(options.responseSchema),
            },
          },
          temperature: options.temperature,
        })

        const choice = response.choices[0]

        if (!choice) {
          throw new Error(`No choices returned from ${modelName}`)
        }

        const message = choice.message

        if (!message || typeof message.content !== 'string') {
          throw new Error(`Invalid response from ${modelName}`)
        }

        const responseContent = message.content

        return options.responseSchema.parse(JSON.parse(responseContent))
      } catch (error: unknown) {
        const isLastAttempt = attempt === RETRY_ATTEMPTS - 1

        if (isLastAttempt) {
          logger.warn(`⚠️ OpenRouter (${modelName}) failed after ${RETRY_ATTEMPTS} attempts, trying next model...`, { error })
        } else {
          logger.warn(`⚠️ OpenRouter (${modelName}) attempt ${attempt + 1} failed, retrying...`, { error })
        }
      }
    }
  }

  throw new Error(`All OpenRouter models failed`)
}

async function askGemini<T extends z.ZodTypeAny>(
  userContent: string,
  options: AIOptions<T>,
  modelNames: string[],
): Promise<z.infer<T>> {
  const config = useRuntimeConfig()

  if (!config.geminiApiKey) {
    throw new Error('GEMINI_API_KEY not configured')
  }

  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey })

  for (const modelName of modelNames) {
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
      logger.warn(`⚠️ Gemini (${modelName}) failed, trying next model...`, { error })
    }
  }

  throw new Error(`All Gemini models failed`)
}

export async function askAI<T extends z.ZodTypeAny>(
  userContent: string,
  options: AIOptions<T>,
): Promise<z.infer<T>> {
  try {
    logger.info('🔗 Attempting AI request via LangChain...')
    return await askAILangChain(userContent, options)
  } catch (langChainError: unknown) {
    logger.warn('⚠️ LangChain failed, falling back to direct API...', { error: langChainError })

    let lastError: unknown = langChainError

    if (options.preferredModel && options.preferredModel !== 'default') {
      const model = options.preferredModel

      if (model.startsWith('tngtech/') || model.startsWith('mistralai/') || model.startsWith('google/')) {
        try {
          return await askOpenRouter(userContent, options, [model])
        } catch (error: unknown) {
          lastError = error
          logger.warn(`⚠️ Preferred model (${model}) failed, falling back to default models...`, { error })
        }
      } else if (model.startsWith('gemini-')) {
        try {
          return await askGemini(userContent, options, [model])
        } catch (error: unknown) {
          lastError = error
          logger.warn(`⚠️ Preferred model (${model}) failed, falling back to default models...`, { error })
        }
      } else {
        logger.warn(`⚠️ Unknown preferred model (${model}), using default models...`)
      }
    }

    for (const model of AI_MODELS.OPENROUTER) {
      try {
        return await askOpenRouter(userContent, options, [model])
      } catch (error: unknown) {
        lastError = error
        logger.warn(`⚠️ OpenRouter (${model}) failed, trying next model...`, { error })
      }
    }

    for (const model of AI_MODELS.GEMINI) {
      try {
        return await askGemini(userContent, options, [model])
      } catch (error: unknown) {
        lastError = error
        logger.warn(`⚠️ Gemini (${model}) failed, trying next model...`, { error })
      }
    }

    logger.error('💥 All AI providers failed (both LangChain and direct API)', { error: lastError })
    throw new Error(`AI analysis failed: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`)
  }
}
