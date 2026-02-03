import type { FileDiff } from '#shared/types/FileDiff'
import type { ReviewComment } from '#shared/types/ReviewComment'
import type { ReviewResult } from '#shared/types/ReviewResult'
import type { AgentComment, AgentType } from '~~/server/utils/multiAgentPrompts'
import { ServiceType } from '#shared/types/ServiceType'
import {
  DEFAULT_MAX_REVIEW_COMMENTS,
  SEVERITY_ORDER,
} from '#shared/types/severity'
import { askAI } from '~~/server/utils/aiService'
import { formatDiffContext } from '~~/server/utils/contextFormatters'
import {
  AGENT_COMMENT_SCHEMA,
  AGENT_PROMPTS,
  AGENT_TYPES,
  MERGE_AGENT_PROMPT,
  MERGE_SUMMARY_SCHEMA,
} from '~~/server/utils/multiAgentPrompts'
import { useLogger } from '~~/server/utils/useLogger'

const logger = useLogger(ServiceType.worker)

const AGENT_MAX_RETRIES = 3
const AGENT_RETRY_BASE_DELAY_MS = 1000

async function runAgent(agentType: AgentType, context: string, preferredModel?: string): Promise<AgentComment[]> {
  const startTime = Date.now()
  logger.info(`🤖 [${agentType}] Agent starting analysis...`)

  let lastError: unknown

  for (let attempt = 1; attempt <= AGENT_MAX_RETRIES; attempt++) {
    try {
      const result = await askAI(context, {
        systemInstruction: AGENT_PROMPTS[agentType],
        responseSchema: AGENT_COMMENT_SCHEMA,
        temperature: 0.1,
        preferredModel,
      })

      const duration = Date.now() - startTime
      logger.info(`✅ [${agentType}] Agent completed in ${duration}ms, found ${result.comments.length} issues`)

      return result.comments
    } catch (error) {
      lastError = error

      if (attempt < AGENT_MAX_RETRIES) {
        const delayMs = AGENT_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)
        logger.warn(`⚠️ [${agentType}] Agent attempt ${attempt}/${AGENT_MAX_RETRIES} failed, retrying in ${delayMs}ms...`, { error })
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
  }

  logger.error(`❌ [${agentType}] Agent failed after ${AGENT_MAX_RETRIES} attempts:`, { error: lastError })
  return []
}

function generateCommentSignature(comment: { filename: string, snippet: string }): string {
  const normalizedSnippet = comment.snippet.trim().replace(/\s+/g, ' ')
  return `${comment.filename}::${normalizedSnippet}`
}

function mergeAgentResults(
  agentResults: Record<AgentType, AgentComment[]>,
  maxComments: number,
): ReviewComment[] {
  const allComments: Array<AgentComment & { source: AgentType }> = []

  for (const agentType of AGENT_TYPES) {
    const agentComments = agentResults[agentType] || []
    for (const comment of agentComments) {
      allComments.push({ ...comment, source: agentType })
    }
  }

  logger.info(`📊 Total comments from all agents: ${allComments.length}`)

  const commentGroups = new Map<string, Array<AgentComment & { source: AgentType }>>()

  for (const comment of allComments) {
    const signature = generateCommentSignature(comment)
    const existing = commentGroups.get(signature) || []
    existing.push(comment)
    commentGroups.set(signature, existing)
  }

  const mergedComments: ReviewComment[] = []

  for (const [, group] of commentGroups) {
    if (group.length === 0) {
      continue
    }

    group.sort((commentA, commentB) => {
      const severityA = SEVERITY_ORDER[commentA.severity] ?? 999
      const severityB = SEVERITY_ORDER[commentB.severity] ?? 999
      return severityA - severityB
    })

    const primary = group[0]
    if (!primary) {
      continue
    }

    const avgConfidence = group.reduce((sum, comment) => sum + comment.confidence, 0) / group.length

    let combinedBody = primary.body
    if (group.length > 1) {
      const additionalInsights = group
        .slice(1)
        .filter(comment => comment.body !== primary.body)
        .map(comment => comment.body)
      if (additionalInsights.length > 0) {
        combinedBody += `\n\n**Additional insights:**\n${additionalInsights.map(insight => `- ${insight}`).join('\n')}`
      }
    }

    let cleanedSuggestion = primary.suggestion
    if (cleanedSuggestion?.startsWith('```')) {
      cleanedSuggestion = cleanedSuggestion.replace(/^```\w*\n?/, '').replace(/\n?```$/, '')
    }

    mergedComments.push({
      filename: primary.filename,
      snippet: primary.snippet,
      body: combinedBody,
      suggestion: cleanedSuggestion,
      severity: primary.severity,
      confidence: avgConfidence,
    })
  }

  mergedComments.sort((commentA, commentB) => {
    const severityA = SEVERITY_ORDER[commentA.severity] ?? 999
    const severityB = SEVERITY_ORDER[commentB.severity] ?? 999
    const severityDiff = severityA - severityB
    if (severityDiff !== 0) {
      return severityDiff
    }
    return commentB.confidence - commentA.confidence
  })

  const cappedComments = mergedComments.slice(0, maxComments)

  logger.info(`✅ Merge complete: ${allComments.length} → ${cappedComments.length} comments (after dedup & cap)`)

  return cappedComments
}

async function generateSummary(context: string, preferredModel?: string): Promise<string> {
  try {
    const summaryResult = await askAI(context, {
      systemInstruction: MERGE_AGENT_PROMPT,
      responseSchema: MERGE_SUMMARY_SCHEMA,
      temperature: 0.2,
      preferredModel,
    })
    return summaryResult.summary
  } catch (error) {
    logger.warn('⚠️ Failed to generate summary:', { error })
    return 'Code review completed.'
  }
}

async function runAgentsSequentially(
  agentTypes: readonly AgentType[],
  context: string,
  preferredModel?: string,
): Promise<AgentComment[][]> {
  const results: AgentComment[][] = []

  for (const agentType of agentTypes) {
    try {
      const result = await runAgent(agentType, context, preferredModel)
      results.push(result)
    } catch (error) {
      logger.error(`❌ [${agentType}] Agent failed unexpectedly, continuing with remaining agents:`, { error })
      results.push([])
    }
  }

  return results
}

export interface MultiAgentReviewOptions {
  preferredModel?: string
  maxComments?: number
  agentExecutionMode?: 'sequential' | 'parallel'
}

export async function analyzeWithMultiAgent(
  diffs: FileDiff[],
  extraContext: Record<string, string> = {},
  options: MultiAgentReviewOptions = {},
): Promise<ReviewResult> {
  if (diffs.length === 0) {
    return { comments: [], summary: 'No reviewable changes found.' }
  }

  const context = formatDiffContext(diffs, extraContext)

  const mode = options.agentExecutionMode ?? 'sequential'
  logger.info(`🚀 Starting multi-agent code review in ${mode} mode...`)
  const startTime = Date.now()

  const results = mode === 'parallel'
    ? await Promise.all(
        AGENT_TYPES.map(agentType => runAgent(agentType, context, options.preferredModel)),
      )
    : await runAgentsSequentially(AGENT_TYPES, context, options.preferredModel)

  const agentResults = AGENT_TYPES.reduce<Record<AgentType, AgentComment[]>>(
    (accumulator, agentType, index) => {
      accumulator[agentType] = results[index] ?? []
      return accumulator
    },
    {} as Record<AgentType, AgentComment[]>,
  )

  logger.info('🔀 Merge Agent: Deduplicating and ranking comments...')
  const maxComments = options.maxComments ?? DEFAULT_MAX_REVIEW_COMMENTS
  const mergedComments = mergeAgentResults(agentResults, maxComments)

  const summary = await generateSummary(context, options.preferredModel)

  const duration = Date.now() - startTime
  logger.info(`🎉 Multi-agent review completed in ${duration}ms`)

  return {
    comments: mergedComments,
    summary,
  }
}
