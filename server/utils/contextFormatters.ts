import type { FileDiff } from '#shared/types/FileDiff'
import { Limits } from '#shared/constants/limits'

export function formatDiffContext(diffs: FileDiff[], extraContext: Record<string, string> = {}): string {
  let context = ''

  if (Object.keys(extraContext).length > 0) {
    context += `
## READ-ONLY CONTEXT (Reference only, do not review these files)
`
    for (const [filename, content] of Object.entries(extraContext)) {
      const fileEntry = `
### FILE: ${filename}
${content}
`
      if (context.length + fileEntry.length < Limits.MAX_CONTEXT_CHARS) {
        context += fileEntry
      }
    }
    context += `
## END READ-ONLY CONTEXT

`
  }

  context += `
## FILES TO REVIEW (Focus on these changes)
`

  for (const diff of diffs) {
    const fileEntry = `
### FILE: ${diff.filename}
${diff.patch}
`
    if (context.length + fileEntry.length < Limits.MAX_CONTEXT_CHARS) {
      context += fileEntry
    } else {
      context += `
... (remaining files truncated due to size limit)`
      break
    }
  }

  return context
}

export function formatReplyContext(
  threadHistory: { author: string, body: string }[],
  filename: string,
  patch: string,
): string {
  const historyText = threadHistory
    .map(historyItem => `${historyItem.author}: ${historyItem.body}`)
    .join('\n---\n')

  let context = `
### FILE: ${filename}

### DIFF:
${patch}

### THREAD HISTORY:
${historyText}
`

  if (context.length > Limits.MAX_CONTEXT_CHARS) {
    context = `${context.slice(0, Limits.MAX_CONTEXT_CHARS)}
 ... (truncated)`
  }

  return context
}

export function formatDiffSummary(diffs: FileDiff[]): string {
  return diffs.map(diff => `
### FILE: ${diff.filename}

**Status**: ${diff.status}

**Patch Snippet**:
${diff.patch ? diff.patch.slice(0, 200) : ''}...
`).join('\n')
}
