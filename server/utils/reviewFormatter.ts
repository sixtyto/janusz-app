import type { FileDiff } from '#shared/types/FileDiff'
import type { ReviewComment } from '#shared/types/ReviewComment'
import { getLineNumberFromPatch } from '~~/server/utils/getLineNumberFromPatch'
import { useLogger } from '~~/server/utils/useLogger'
import { ServiceType } from '#shared/types/ServiceType'

const logger = useLogger(ServiceType.worker)

export function prepareReviewComments(
  diffs: FileDiff[],
  aiComments: ReviewComment[],
  existingSignatures: Set<string>,
): ReviewComment[] {
  const newComments: ReviewComment[] = []

  for (const comment of aiComments) {
    const targetDiff = diffs.find(d => d.filename === comment.filename)
    if (!targetDiff) {
      logger.warn(`⚠️ Skipped comment for unknown file: ${comment.filename}`)
      continue
    }

    if (!targetDiff.patch) {
      continue
    }

    const lineInfo = getLineNumberFromPatch(targetDiff.patch, comment.snippet)
    if (lineInfo === null) {
      logger.warn(`⚠️ Could not find snippet in ${comment.filename}:\n${comment.snippet}`)
      continue
    }

    const iconMap: Record<Severity, string> = { CRITICAL: '🚫', HIGH: '⚠️', MEDIUM: '📝', LOW: 'ℹ️' } as const
    const icon = iconMap[comment.severity] || '📝'
    let formattedBody = `${icon} **[${comment.severity}]** ${comment.body}`

    if (comment.suggestion) {
      formattedBody += `\n\n\`\`\`suggestion\n${comment.suggestion}\n\`\`\``
    }

    const signature = `${comment.filename}:${lineInfo.line}:${formattedBody.trim()}`
    if (!existingSignatures.has(signature)) {
      newComments.push({
        ...comment,
        line: lineInfo.line,
        start_line: lineInfo.start_line,
        side: lineInfo.side,
        body: formattedBody,
      })
    }
  }

  return newComments
}

export function createAnnotations(comments: ReviewComment[]) {
  return comments.map((comment) => {
    const annotationLevelMap: Record<Severity, 'failure' | 'warning' | 'notice'> = {
      CRITICAL: 'failure',
      HIGH: 'warning',
      MEDIUM: 'warning',
      LOW: 'notice',
    } as const
    const annotationLevel = annotationLevelMap[comment.severity] || 'notice'

    return {
      path: comment.filename,
      start_line: comment.start_line ?? comment.line ?? 1,
      end_line: comment.line ?? comment.start_line ?? 1,
      annotation_level: annotationLevel,
      message: comment.body,
    }
  })
}
