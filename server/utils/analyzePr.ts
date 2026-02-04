import type { FileDiff } from '#shared/types/FileDiff'
import type { ReviewResult } from '#shared/types/ReviewResult'
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

export async function analyzePr(
  diffs: FileDiff[],
  extraContext: Record<string, string> = {},
  preferredModel?: string,
  agentExecutionMode?: 'sequential' | 'parallel',
): Promise<ReviewResult> {
  if (diffs.length === 0) {
    return { comments: [], summary: 'No reviewable changes found.' }
  }

  logger.info('🤖 Using multi-agent review')
  return await analyzeWithMultiAgent(diffs, extraContext, {
    preferredModel,
    agentExecutionMode,
  })
}

export async function analyzeReply(
  threadHistory: { author: string, body: string }[],
  filename: string,
  patch: string,
): Promise<string> {
  const context = formatReplyContext(threadHistory, filename, patch)

  const data = await askAI(context, {
    systemInstruction: REPLY_SYSTEM_PROMPT,
    responseSchema: REPLY_SCHEMA,
    temperature: 0.3,
  })

  return data.body
}

export async function generatePrDescription(
  diffs: FileDiff[],
  customDescriptionPrompt?: string,
): Promise<string> {
  const context = formatDiffContext(diffs)

  const systemPrompt = customDescriptionPrompt || DESCRIPTION_SYSTEM_PROMPT

  const data = await askAI(context, {
    systemInstruction: systemPrompt,
    responseSchema: DESCRIPTION_SCHEMA,
    temperature: 0.1,
  })

  return `${GENERATED_DESCRIPTION_START_MARKER}\n${data.description}\n${GENERATED_DESCRIPTION_END_MARKER}`
}
