import type { FileDiff } from '#shared/types/FileDiff'
import type { ReviewResult } from '#shared/types/ReviewResult'
import { askAI } from '~~/server/utils/aiService'
import { formatDiffContext, formatReplyContext } from '~~/server/utils/contextFormatters'
import {
  DESCRIPTION_SCHEMA,
  DESCRIPTION_SYSTEM_PROMPT,
  REPLY_SCHEMA,
  REPLY_SYSTEM_PROMPT,
  REVIEW_SCHEMA,
  REVIEW_SYSTEM_PROMPT,
} from '~~/server/utils/januszPrompts'

export async function analyzePr(
  diffs: FileDiff[],
  extraContext: Record<string, string> = {},
  customReviewPrompt?: string,
  preferredModel?: string,
): Promise<ReviewResult> {
  if (diffs.length === 0) {
    return { comments: [], summary: 'No reviewable changes found.' }
  }

  const context = formatDiffContext(diffs, extraContext)

  // Use custom prompt or default
  const systemPrompt = customReviewPrompt || REVIEW_SYSTEM_PROMPT

  const reviewData = await askAI(context, {
    systemInstruction: systemPrompt,
    responseSchema: REVIEW_SCHEMA,
    temperature: 0.1,
    preferredModel,
  })

  if (!Array.isArray(reviewData.comments)) {
    reviewData.comments = []
  }

  // Map AI severity values to ReviewComment severity values
  const severityMap: Record<string, 'CRITICAL' | 'WARNING' | 'INFO'> = {
    CRITICAL: 'CRITICAL',
    HIGH: 'WARNING',
    MEDIUM: 'WARNING',
    LOW: 'INFO',
  }

  const mappedComments = reviewData.comments.map((comment) => {
    let suggestion = comment.suggestion
    if (suggestion?.startsWith('```')) {
      suggestion = suggestion.replace(/^```\w*\n?/, '').replace(/\n?```$/, '')
    }

    return {
      ...comment,
      severity: severityMap[comment.severity] || 'WARNING',
      suggestion,
    }
  })

  return {
    summary: reviewData.summary,
    comments: mappedComments,
  }
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

  return data.description
}
