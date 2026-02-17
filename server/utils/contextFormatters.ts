import type { FileDiff } from '#shared/types/FileDiff'
import { Limits } from '#shared/constants/limits'

export function formatDiffContext(diffs: FileDiff[], extraContext: Record<string, string> = {}): string {
  let context = ''
  let hasExtraContext = false

  // Optimization: Use loop to detect if extraContext has keys and print header lazily
  // This avoids Object.keys() or Object.entries() allocation entirely.
  for (const filename in extraContext) {
    if (Object.prototype.hasOwnProperty.call(extraContext, filename)) {
      if (!hasExtraContext) {
        context += `
## READ-ONLY CONTEXT (Reference only, do not review these files)
`
        hasExtraContext = true
      }

      if (context.length >= Limits.MAX_CONTEXT_CHARS) {
        // Optimization: Stop iterating if we've already reached the limit
        break
      }

      const content = extraContext[filename]
      if (typeof content !== 'string') {
        continue
      }

      // Optimization: Calculate length before creating string to avoid unnecessary allocation
      const entryLength = 13 + filename.length + content.length

      if (context.length + entryLength < Limits.MAX_CONTEXT_CHARS) {
        context += `
### FILE: ${filename}
${content}
`
      }
    }
  }

  if (hasExtraContext) {
    context += `
## END READ-ONLY CONTEXT

`
  }

  context += `
## FILES TO REVIEW (Focus on these changes)
`

  for (const diff of diffs) {
    // Optimization: Calculate length before creating string
    const entryLength = 13 + diff.filename.length + diff.patch.length

    if (context.length + entryLength < Limits.MAX_CONTEXT_CHARS) {
      context += `
### FILE: ${diff.filename}
${diff.patch}
`
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
