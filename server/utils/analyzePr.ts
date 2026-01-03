import type { FileDiff } from '#shared/types/FileDiff'
import type { ReviewResult } from '#shared/types/ReviewResult'
import { askGemini } from '~~/server/utils/aiService'
import { formatDiffContext, formatReplyContext } from '~~/server/utils/contextFormatters'
import {
  DESCRIPTION_SCHEMA,
  DESCRIPTION_SYSTEM_PROMPT,
  REPLY_SCHEMA,
  REPLY_SYSTEM_PROMPT,
  REVIEW_SCHEMA,
  REVIEW_SYSTEM_PROMPT,
} from '~~/server/utils/januszPrompts'

export async function analyzePr(diffs: FileDiff[], extraContext: Record<string, string> = {}): Promise<ReviewResult> {
  if (diffs.length === 0) {
    return { comments: [], summary: 'No reviewable changes found.' }
  }

  const context = formatDiffContext(diffs, extraContext)

  const reviewData = await askGemini(context, {
    systemInstruction: REVIEW_SYSTEM_PROMPT,
    responseSchema: REVIEW_SCHEMA,
    temperature: 0.1,
  })

  if (!Array.isArray(reviewData.comments)) {
    reviewData.comments = []
  }

  reviewData.comments = reviewData.comments.map((comment) => {
    let suggestion = comment.suggestion
    if (suggestion?.startsWith('```')) {
      suggestion = suggestion.replace(/^```\w*\n?/, '').replace(/\n?```$/, '')
    }

    return {
      ...comment,
      suggestion,
    }
  })

  return reviewData as ReviewResult
}

export async function analyzeReply(
  threadHistory: { author: string, body: string }[],
  filename: string,
  patch: string,
): Promise<string> {
  const context = formatReplyContext(threadHistory, filename, patch)

  const data = await askGemini(context, {
    systemInstruction: REPLY_SYSTEM_PROMPT,
    responseSchema: REPLY_SCHEMA,
    temperature: 0.3,
  })

  return data.body
}

export async function generatePrDescription(diffs: FileDiff[]): Promise<string> {
  const context = formatDiffContext(diffs)

  const data = await askGemini(context, {
    systemInstruction: DESCRIPTION_SYSTEM_PROMPT,
    responseSchema: DESCRIPTION_SCHEMA,
    temperature: 0.1,
  })

  return data.description
}
