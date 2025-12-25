import path from 'node:path'
import { ServiceType } from '#shared/types/ServiceType'
import { GoogleGenAI } from '@google/genai'

export async function selectContextFiles(
  index: Record<string, string[]>,
  diffs: FileDiff[],
): Promise<string[]> {
  const config = useRuntimeConfig()
  const logger = createLogger(ServiceType.contextSelector)

  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey })

  const diffSummary = diffs.map(d => `File: ${d.filename}
Status: ${d.status}
Patch snippet:
${d.patch?.slice(0, 200)}...`).join('\n\n')

  const diffFilenames = new Set(diffs.map(d => d.filename))
  const diffDirs = new Set(diffs.map(d => path.dirname(d.filename)))
  const MAX_INDEX_FILES = 500

  const sortedEntries = Object.entries(index)
    .filter(([f]) => !diffFilenames.has(f))
    .sort(([aPath], [bPath]) => {
      const aDir = path.dirname(aPath)
      const bDir = path.dirname(bPath)
      const aRelevant = diffDirs.has(aDir)
      const bRelevant = diffDirs.has(bDir)

      if (aRelevant && !bRelevant) {
        return -1
      }
      if (!aRelevant && bRelevant) {
        return 1
      }
      return 0
    })
    .slice(0, MAX_INDEX_FILES)

  const filteredIndex = Object.fromEntries(sortedEntries)
  const indexStr = JSON.stringify(filteredIndex)

  const systemPrompt = `
ROLE:
You are an expert code analyst helper. Your task is to identify relevant existing files in the repository that provide context for the current Pull Request changes.
You are given a "Symbol Map" of the repository (files and their exported symbols) and a summary of the "PR Changes".

TASK:
1. Analyze the PR changes to understand what logic is being modified.
2. IDENTIFY DEPENDENCIES: Look at imports, function calls, and class usage in the PR code.
3. SEARCH SYMBOL MAP: Find the files that DEFINE these symbols.
4. PRIORITIZE:
   - Files that export types/interfaces used in the PR.
      - Files that export base classes or utility functions used in the PR.
      - Configuration files if the PR touches related logic.
   5. IGNORE files that are already in the "PR CHANGES" list.
   6. Select up to 10 most relevant existing files.
   7. Return ONLY a JSON array of strings (file paths). Do not explain.
   
   
   EXAMPLE RESPONSE:
   ["server/utils/auth.ts", "shared/types/User.ts"]
   `

  const prompt = `
   SYMBOL MAP:
   ${indexStr}
   
   PR CHANGES:
   ${diffSummary}
   `

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: {
        role: 'user',
        parts: [{ text: prompt }],
      },
      config: {
        responseMimeType: 'application/json',
        systemInstruction: systemPrompt,
      },
    })

    const text = response.text
    if (!text) {
      return []
    }

    const files = JSON.parse(text)
    if (Array.isArray(files)) {
      return files
        .filter(f => Object.prototype.hasOwnProperty.call(index, f))
        .slice(0, 10) as string[]
    }
    return []
  } catch (error) {
    logger.warn('Failed to select context files', { error })
    return []
  }
}
