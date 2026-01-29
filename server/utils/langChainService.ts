import type { z } from 'zod'
import { AI_MODELS } from '#shared/types/aiModels'
import { ServiceType } from '#shared/types/ServiceType'
import { askLangChainGemini } from '~~/server/utils/llm/langChainGemini'
import { askLangChainOpenRouter } from '~~/server/utils/llm/langChainOpenRouter'
import { useLogger } from '~~/server/utils/useLogger'

const logger = useLogger(ServiceType.worker)

interface AIOptions<T extends z.ZodTypeAny> {
  systemInstruction: string
  responseSchema: T
  temperature?: number
  preferredModel?: string
}

export async function askAILangChain<T extends z.ZodTypeAny>(
  userContent: string,
  options: AIOptions<T>,
): Promise<z.infer<T>> {
  let lastError: unknown = new Error('No AI models were available or all attempts failed without error details')

  if (options.preferredModel && options.preferredModel !== 'default') {
    const model = options.preferredModel

    if (model.startsWith('tngtech/') || model.startsWith('mistralai/') || model.startsWith('google/')) {
      try {
        return await askLangChainOpenRouter(userContent, options, [model])
      } catch (error: unknown) {
        lastError = error
        logger.warn(`⚠️ Preferred LangChain model (${model}) failed, falling back to default models...`, { error })
      }
    } else if (model.startsWith('gemini-')) {
      try {
        return await askLangChainGemini(userContent, options, [model])
      } catch (error: unknown) {
        lastError = error
        logger.warn(`⚠️ Preferred LangChain model (${model}) failed, falling back to default models...`, { error })
      }
    } else {
      logger.warn(`⚠️ Unknown preferred model (${model}), using default models...`)
    }
  }

  for (const model of AI_MODELS.OPENROUTER) {
    try {
      return await askLangChainOpenRouter(userContent, options, [model])
    } catch (error: unknown) {
      lastError = error
      logger.warn(`⚠️ LangChain OpenRouter (${model}) failed, trying next model...`, { error })
    }
  }

  for (const model of AI_MODELS.GEMINI) {
    try {
      return await askLangChainGemini(userContent, options, [model])
    } catch (error: unknown) {
      lastError = error
      logger.warn(`⚠️ LangChain Gemini (${model}) failed, trying next model...`, { error })
    }
  }

  logger.error('💥 All LangChain AI providers failed', { error: lastError })
  throw new Error(`LangChain AI analysis failed: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`)
}
