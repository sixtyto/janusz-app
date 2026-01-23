import { ServiceType } from '#shared/types/ServiceType'
import { GoogleGenAI } from '@google/genai'
import { OpenRouter } from '@openrouter/sdk'
import { z } from 'zod'
import { useLogger } from '~~/server/utils/useLogger'

const logger = useLogger(ServiceType.worker)

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

interface AIOptions<T extends z.ZodTypeAny> {
  systemInstruction: string
  responseSchema: T
  temperature?: number
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
    const retryDelays = [0, 5, 10, 15, 20, 25]

    for (let attempt = 0; attempt < retryDelays.length; attempt++) {
      try {
        const delayMs = retryDelays[attempt] ?? 0

        if (delayMs > 0) {
          logger.info(`🔄 Retry ${attempt}/${retryDelays.length - 1} for ${modelName} after ${delayMs}s delay...`)
          await delay(delayMs * 1000)
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
        const isLastAttempt = attempt === retryDelays.length - 1

        if (isLastAttempt) {
          logger.warn(`⚠️ OpenRouter (${modelName}) failed after ${retryDelays.length} attempts, trying next model...`, { error })
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
  const openrouterModels = [
    'deepseek/deepseek-r1-0528:free',
    'qwen/qwen3-coder:free',
    'z-ai/glm-4.5-air:free',
    'google/gemma-3-27b-it:free',
  ]

  const geminiModels = ['gemini-3-flash-preview', 'gemini-2.5-flash']

  let lastError: unknown

  for (const model of openrouterModels) {
    try {
      return await askOpenRouter(userContent, options, [model])
    } catch (error: unknown) {
      lastError = error
      logger.warn(`⚠️ OpenRouter (${model}) failed, trying next model...`, { error })
    }
  }

  for (const model of geminiModels) {
    try {
      return await askGemini(userContent, options, [model])
    } catch (error: unknown) {
      lastError = error
      logger.warn(`⚠️ Gemini (${model}) failed, trying next model...`, { error })
    }
  }

  logger.error('💥 All AI providers failed', { error: lastError })
  throw new Error(`AI analysis failed: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`)
}
