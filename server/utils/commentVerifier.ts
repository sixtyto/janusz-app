import type { FileDiff } from '#shared/types/FileDiff'
import type { ReviewComment } from '#shared/types/ReviewComment'
import type { JobExecutionCollector } from '~~/server/utils/jobExecutionCollector'
import { ServiceType } from '#shared/types/ServiceType'
import { z } from 'zod'
import { askAI } from '~~/server/utils/aiService'
import { useLogger } from '~~/server/utils/useLogger'

const logger = useLogger(ServiceType.worker)

const VERIFIER_SCHEMA = z.object({
  verdict: z.enum(['approve', 'reject']),
  rejectReason: z.string().optional(),
})

const VERIFIER_SYSTEM_PROMPT = `
You are a code review verifier. Your job is to validate whether a proposed review comment is supported by the diff.

### RULES
- Use ONLY the provided diff context and snippet.
- Approve ONLY if the issue is real and clearly evidenced in the diff.
- Reject if the comment is speculative, inaccurate, or not supported by the snippet/diff.
- Do NOT invent new issues or rewrite the comment.
- If rejecting, provide a short, specific reason.
`

export interface VerificationRejection {
  comment: ReviewComment
  reason: string
}

export interface VerificationResult {
  approved: ReviewComment[]
  rejected: VerificationRejection[]
}

function buildVerificationContext(comment: ReviewComment, diffPatch: string): string {
  const suggestion = comment.suggestion?.trim() ? comment.suggestion : 'none'
  return [
    `FILE: ${comment.filename}`,
    `SEVERITY: ${comment.severity}`,
    `CONFIDENCE: ${comment.confidence}`,
    'DIFF:',
    diffPatch || '(no diff provided)',
    'SNIPPET:',
    comment.snippet,
    'COMMENT:',
    comment.body,
    'SUGGESTION:',
    suggestion,
  ].join('\n')
}

export async function verifyReviewComments(
  diffs: FileDiff[],
  comments: ReviewComment[],
  preferredModel?: string,
  collector?: JobExecutionCollector,
): Promise<VerificationResult> {
  if (comments.length === 0) {
    return { approved: [], rejected: [] }
  }

  collector?.startOperation('comment_verification')

  let hadFailure = false

  const results = await Promise.all(
    comments.map(async (comment) => {
      const diff = diffs.find(d => d.filename === comment.filename)
      const context = buildVerificationContext(comment, diff?.patch ?? '')

      try {
        const aiResult = await askAI(context, {
          systemInstruction: VERIFIER_SYSTEM_PROMPT,
          responseSchema: VERIFIER_SCHEMA,
          temperature: 0.1,
          preferredModel,
        })

        for (const attempt of aiResult.attempts) {
          collector?.recordOperationAttempt('comment_verification', attempt)
        }

        return {
          comment,
          verdict: aiResult.result.verdict,
          rejectReason: aiResult.result.rejectReason,
        }
      } catch (error) {
        hadFailure = true
        logger.warn('⚠️ Comment verification failed, approving comment by default', {
          error,
          filename: comment.filename,
          severity: comment.severity,
        })
        return {
          comment,
          verdict: 'approve' as const,
          rejectReason: 'Verification failed',
        }
      }
    }),
  )

  if (hadFailure) {
    collector?.failOperation('comment_verification', 'One or more verification requests failed')
  } else {
    collector?.completeOperation('comment_verification')
  }

  const approved: ReviewComment[] = []
  const rejected: VerificationRejection[] = []

  for (const result of results) {
    if (result.verdict === 'approve') {
      approved.push(result.comment)
    } else {
      rejected.push({
        comment: result.comment,
        reason: result.rejectReason?.trim() || 'Rejected by verifier',
      })
    }
  }

  return { approved, rejected }
}
