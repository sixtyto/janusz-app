import type { FileDiff } from '#shared/types/FileDiff'
import path from 'node:path'
import { ServiceType } from '#shared/types/ServiceType'
import { askAI } from '~~/server/utils/aiService'
import { formatDiffSummary } from '~~/server/utils/contextFormatters'
import { SELECT_CONTEXT_SCHEMA, SELECT_CONTEXT_SYSTEM_PROMPT } from '~~/server/utils/januszPrompts'
import { useLogger } from '~~/server/utils/useLogger'

export async function selectContextFiles(
  index: Record<string, string[]>,
  diffs: FileDiff[],
): Promise<string[]> {
  const logger = useLogger(ServiceType.contextSelector)

  const diffSummary = formatDiffSummary(diffs)

  const diffFilenames = new Set(diffs.map(diff => diff.filename))
  const diffDirs = new Set(diffs.map(diff => path.dirname(diff.filename)))
  const MAX_INDEX_FILES = 500

  const sortedEntries = Object.entries(index)
    .filter(([filename]) => !diffFilenames.has(filename))
    .sort(([pathA], [pathB]) => {
      const dirA = path.dirname(pathA)
      const dirB = path.dirname(pathB)
      const isRelevantA = diffDirs.has(dirA)
      const isRelevantB = diffDirs.has(dirB)

      if (isRelevantA && !isRelevantB) {
        return -1
      }
      if (!isRelevantA && isRelevantB) {
        return 1
      }
      return 0
    })
    .slice(0, MAX_INDEX_FILES)

  const filteredIndex = Object.fromEntries(sortedEntries)
  const indexStr = JSON.stringify(filteredIndex)

  const prompt = `
### SYMBOL MAP
${indexStr}

### PR CHANGES
${diffSummary}
`

  try {
    const files = await askAI(prompt, {
      systemInstruction: SELECT_CONTEXT_SYSTEM_PROMPT,
      responseSchema: SELECT_CONTEXT_SCHEMA,
      temperature: 0.1,
    })

    return files
      .filter(filename => Object.prototype.hasOwnProperty.call(index, filename))
      .slice(0, 10)
  } catch (error) {
    logger.warn('⚠️ Failed to select context files', { error })
    return []
  }
}
