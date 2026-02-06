import type { AiAttempt } from '#shared/types/JobExecutionHistory'
import type { z } from 'zod'
import type { AiResponse } from '~~/server/utils/ai-service/aiTypes'
import { askLangChainGemini } from '~~/server/utils/ai-service/langChainGemini'
import { askLangChainOpenRouter } from '~~/server/utils/ai-service/langChainOpenRouter'
import { askLangChainZhipuGlm } from '~~/server/utils/ai-service/langChainZhipuGlm'
import { useLogger } from '~~/server/utils/useLogger'
import { AI_MODELS } from '~~/shared/types/aiModels'
import { ServiceType } from '~~/shared/types/ServiceType'

export interface AIOptions<T extends z.ZodTypeAny> {
  systemInstruction: string
  responseSchema: T
  temperature?: number
  preferredModel?: string
}

export interface AiResultWithAttempts<T> {
  result: T
  attempts: AiAttempt[]
  successfulModel: string
  totalInputTokens: number
  totalOutputTokens: number
}

const logger = useLogger(ServiceType.worker)

function extractErrorCode(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    if (message.includes('rate') && message.includes('limit')) {
      return 'rate_limit_exceeded'
    }
    if (message.includes('timeout')) {
      return 'timeout'
    }
    if (message.includes('api key') || message.includes('authentication') || message.includes('unauthorized')) {
      return 'authentication_error'
    }
    if (message.includes('quota')) {
      return 'quota_exceeded'
    }
    return error.message.slice(0, 100)
  }
  return 'unknown_error'
}

async function tryModel<T extends z.ZodTypeAny>(
  modelName: string,
  provider: 'zhipu' | 'openrouter' | 'gemini',
  userContent: string,
  options: AIOptions<T>,
): Promise<AiResponse<z.infer<T>>> {
  switch (provider) {
    case 'zhipu':
      return await askLangChainZhipuGlm(userContent, options, [modelName])
    case 'openrouter':
      return await askLangChainOpenRouter(userContent, options, [modelName])
    case 'gemini':
      return await askLangChainGemini(userContent, options, [modelName])
  }
}

export async function askAI<T extends z.ZodTypeAny>(
  userContent: string,
  options: AIOptions<T>,
): Promise<AiResultWithAttempts<z.infer<T>>> {
  const attempts: AiAttempt[] = []
  let lastError: unknown = new Error('No AI models were available or all attempts failed without error details')

  const modelsToTry: Array<{ model: string, provider: 'zhipu' | 'openrouter' | 'gemini' }> = []

  if (options.preferredModel && options.preferredModel !== 'default') {
    const model = options.preferredModel
    if (model.startsWith('glm-')) {
      modelsToTry.push({ model, provider: 'zhipu' })
    } else if (model.startsWith('tngtech/') || model.startsWith('mistralai/') || model.startsWith('google/') || model.startsWith('upstage/') || model.startsWith('qwen/')) {
      modelsToTry.push({ model, provider: 'openrouter' })
    } else if (model.startsWith('gemini-')) {
      modelsToTry.push({ model, provider: 'gemini' })
    } else {
      logger.warn(`⚠️ Unknown preferred model (${model}), using default models...`)
    }
  }

  for (const model of AI_MODELS.ZHIPU_GLM) {
    modelsToTry.push({ model, provider: 'zhipu' })
  }
  for (const model of AI_MODELS.OPENROUTER) {
    modelsToTry.push({ model, provider: 'openrouter' })
  }
  for (const model of AI_MODELS.GEMINI) {
    modelsToTry.push({ model, provider: 'gemini' })
  }

  let successfulResult: z.infer<T> | undefined
  let successfulModel: string | undefined

  for (const { model, provider } of modelsToTry) {
    const startedAt = new Date().toISOString()
    const startTime = Date.now()

    try {
      const response = await tryModel(model, provider, userContent, options)
      const completedAt = new Date().toISOString()

      attempts.push({
        model,
        startedAt,
        completedAt,
        durationMs: response.durationMs,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
      })

      successfulResult = response.result
      successfulModel = model
      break
    } catch (error: unknown) {
      lastError = error
      const failedAt = new Date().toISOString()
      const durationMs = Date.now() - startTime

      attempts.push({
        model,
        startedAt,
        failedAt,
        durationMs,
        error: extractErrorCode(error),
      })

      logger.warn(`⚠️ Model (${model}) failed, trying next model...`, { error })
    }
  }

  if (successfulResult !== undefined && successfulModel !== undefined) {
    const totalInputTokens = attempts.reduce((sum, a) => sum + (a.inputTokens ?? 0), 0)
    const totalOutputTokens = attempts.reduce((sum, a) => sum + (a.outputTokens ?? 0), 0)

    return {
      result: successfulResult,
      attempts,
      successfulModel,
      totalInputTokens,
      totalOutputTokens,
    }
  }

  logger.error('💥 All LangChain AI providers failed', { error: lastError })
  throw new Error(`LangChain AI analysis failed: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`)
}
