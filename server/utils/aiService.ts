import type { z } from 'zod'
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

const logger = useLogger(ServiceType.worker)

export async function askAI<T extends z.ZodTypeAny>(
  userContent: string,
  options: AIOptions<T>,
): Promise<z.infer<T>> {
  let lastError: unknown = new Error('No AI models were available or all attempts failed without error details')

  if (options.preferredModel && options.preferredModel !== 'default') {
    const model = options.preferredModel

    if (model.startsWith('glm-')) {
      try {
        return await askLangChainZhipuGlm(userContent, options, [model])
      } catch (error: unknown) {
        lastError = error
        logger.warn(`⚠️ Preferred LangChain model (${model}) failed, falling back to default models...`, { error })
      }
    } else if (model.startsWith('tngtech/') || model.startsWith('mistralai/') || model.startsWith('google/') || model.startsWith('upstage/') || model.startsWith('qwen/')) {
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

  for (const model of AI_MODELS.ZHIPU_GLM) {
    try {
      return await askLangChainZhipuGlm(userContent, options, [model])
    } catch (error: unknown) {
      lastError = error
      logger.warn(`⚠️ LangChain Zhipu GLM (${model}) failed, trying next model...`, { error })
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
