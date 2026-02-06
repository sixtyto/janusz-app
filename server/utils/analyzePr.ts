import type { FileDiff } from '#shared/types/FileDiff'
import type { JobExecutionCollector } from '~~/server/utils/jobExecutionCollector'
import type { MultiAgentReviewResult } from '~~/server/utils/multiAgentReview'
import {
  GENERATED_DESCRIPTION_END_MARKER,
  GENERATED_DESCRIPTION_START_MARKER,
} from '#shared/constants/descriptionMarkers'
import { ServiceType } from '#shared/types/ServiceType'
import { askAI } from '~~/server/utils/aiService'
import { formatDiffContext, formatReplyContext } from '~~/server/utils/contextFormatters'
import {
  DESCRIPTION_SCHEMA,
  DESCRIPTION_SYSTEM_PROMPT,
  REPLY_SCHEMA,
  REPLY_SYSTEM_PROMPT,
} from '~~/server/utils/januszPrompts'

import { analyzeWithMultiAgent } from '~~/server/utils/multiAgentReview'
import { useLogger } from '~~/server/utils/useLogger'

const logger = useLogger(ServiceType.worker)

export interface AnalyzePrOptions {
  preferredModel?: string
  agentExecutionMode?: 'sequential' | 'parallel'
  collector?: JobExecutionCollector
}

export async function analyzePr(
  diffs: FileDiff[],
  extraContext: Record<string, string> = {},
  options: AnalyzePrOptions = {},
): Promise<MultiAgentReviewResult> {
  if (diffs.length === 0) {
    return {
      comments: [],
      summary: 'No reviewable changes found.',
      totalRawComments: 0,
      totalMergedComments: 0,
    }
  }

  logger.info('🤖 Using multi-agent review')
  return await analyzeWithMultiAgent(diffs, extraContext, {
    preferredModel: options.preferredModel,
    agentExecutionMode: options.agentExecutionMode,
    collector: options.collector,
  })
}

export async function analyzeReply(
  threadHistory: { author: string, body: string }[],
  filename: string,
  patch: string,
  collector?: JobExecutionCollector,
): Promise<string> {
  collector?.startOperation('reply_generation')

  const context = formatReplyContext(threadHistory, filename, patch)

  try {
    const aiResult = await askAI(context, {
      systemInstruction: REPLY_SYSTEM_PROMPT,
      responseSchema: REPLY_SCHEMA,
      temperature: 0.3,
    })

    for (const attempt of aiResult.attempts) {
      collector?.recordOperationAttempt('reply_generation', attempt)
    }

    collector?.completeOperation('reply_generation')

    return aiResult.result.body
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    collector?.failOperation('reply_generation', errorMessage)
    throw error
  }
}

export async function generatePrDescription(
  diffs: FileDiff[],
  customDescriptionPrompt?: string,
  collector?: JobExecutionCollector,
): Promise<string> {
  collector?.startOperation('description_generation')

  const context = formatDiffContext(diffs)
  const systemPrompt = customDescriptionPrompt || DESCRIPTION_SYSTEM_PROMPT

  try {
    const aiResult = await askAI(context, {
      systemInstruction: systemPrompt,
      responseSchema: DESCRIPTION_SCHEMA,
      temperature: 0.1,
    })

    for (const attempt of aiResult.attempts) {
      collector?.recordOperationAttempt('description_generation', attempt)
    }

    collector?.completeOperation('description_generation')

    return `${GENERATED_DESCRIPTION_START_MARKER}\n${aiResult.result.description}\n${GENERATED_DESCRIPTION_END_MARKER}`
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    collector?.failOperation('description_generation', errorMessage)
    throw error
  }
}
