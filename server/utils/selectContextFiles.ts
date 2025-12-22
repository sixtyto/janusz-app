import { GoogleGenAI } from '@google/genai'

export async function selectContextFiles(
  index: Record<string, string[]>,
  diffs: FileDiff[],
): Promise<string[]> {
  const config = useRuntimeConfig()
  const logger = createLogger('context-selector')

  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey })

  const diffSummary = diffs.map(d => `File: ${d.filename}
Status: ${d.status}
Patch snippet:
${d.patch?.slice(0, 200)}...`).join('\n\n')

  let indexStr = JSON.stringify(index)
  if (indexStr.length > 100000) {
    indexStr = `${indexStr.slice(0, 100000)}... (truncated)`
  }

  const systemPrompt = `
ROLE:
You are an expert code analyst helper. Your task is to identify relevant existing files in the repository that provide context for the current Pull Request changes.
You are given a "Symbol Map" of the repository (files and their exported symbols) and a summary of the "PR Changes".  

TASK:
1. Analyze the PR changes to understand what logic is being modified or added.
2. Look at the Symbol Map. Find files that export symbols used in the PR or that seem semantically related (e.g., if "auth.ts" is changed, maybe "user.ts" is relevant).
3. IGNORE files that are already in the "PR CHANGES" list.
4. Select up to 5 most relevant existing files that should be read to provide context.
5. Return ONLY a JSON array of strings (file paths). Do not explain.


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
    if (!text)
      return []

    const files = JSON.parse(text)
    if (Array.isArray(files)) {
      return files
        .filter(f => Object.prototype.hasOwnProperty.call(index, f))
        .slice(0, 5) as string[]
    }
    return []
  }
  catch (error) {
    logger.warn('Failed to select context files', { error })
    return []
  }
}
