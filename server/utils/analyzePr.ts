import { GoogleGenAI } from '@google/genai'

const reviewSchema = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING', description: 'Strict, professional technical feedback. No polite fillers.' },
    comments: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          filename: { type: 'STRING', description: 'Full path from diff header.' },
          snippet: { type: 'STRING', description: 'Exact code line(s) from the added lines, without leading "+".' },
          body: { type: 'STRING', description: 'Concise explanation of the problem.' },
          suggestion: { type: 'STRING', description: 'Valid, ready-to-commit code replacement. No markdown, no comments.' },
          severity: { type: 'STRING', enum: ['CRITICAL', 'WARNING', 'INFO'], description: 'Severity level of the issue.' },
          confidence: { type: 'NUMBER', description: 'Confidence level of the issue.' },
        },
        required: ['filename', 'snippet', 'body', 'severity'],
      },
    },
  },
  required: ['summary', 'comments'],
}

export async function analyzePr(diffs: FileDiff[], extraContext: Record<string, string> = {}): Promise<ReviewResult> {
  const config = useRuntimeConfig()
  const logger = createLogger('worker')

  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey })

  if (diffs.length === 0) {
    return { comments: [], summary: 'No reviewable changes found.' }
  }

  let context = ''
  const MAX_CHARS = 1000000

  if (Object.keys(extraContext).length > 0) {
    context += `--- READ-ONLY CONTEXT (Reference only, do not review these files) ---\n`
    for (const [filename, content] of Object.entries(extraContext)) {
      const fileEntry = `\n--- FILE: ${filename} ---\n${content}\n`
      if (context.length + fileEntry.length < MAX_CHARS) {
        context += fileEntry
      }
    }
    context += `\n--- END READ-ONLY CONTEXT ---\n\n`
  }

  context += `--- FILES TO REVIEW (Focus on these changes) ---\n`

  for (const diff of diffs) {
    const fileEntry = `\n--- FILE: ${diff.filename} ---\n${diff.patch}\n`
    if (context.length + fileEntry.length < MAX_CHARS) {
      context += fileEntry
    }
    else {
      context += `\n... (remaining files truncated due to size limit)`
      break
    }
  }

  const systemPrompt = `
You are Janusz, a Principal Software Engineer and Code Reviewer with 20 years of experience.
Your standards are extremely high. You prioritize security, performance, and maintainability above all else.
You do NOT care about code style (indentation, spacing) - Prettier handles that.
You are reviewing a Pull Request based on the provided git diffs.

--- ROLE & TONE ---
- **Tone**: Direct, professional, concise, slightly strict. No fluff ("Great job", "Nice code").
- **Philosophy**: "Silence is gold". If the code is good, return an empty comment list. Do NOT invent issues.
- **Language**: Write comment bodies in technical English (technical standard).

--- CRITICAL INSTRUCTIONS FOR DIFF PARSING ---
The input is a GIT PATCH.
- Lines starting with \`-\` are removed code. If the removal is a mistake or creates a security/logic issue, COMMENT on it.
- Lines starting with \`+\` are added code. FOCUS on these.
- **IMPORTANT**: When returning a "snippet", you MUST strip the leading \`+\` or \`-\` marker and any extra whitespace created by the diff format. The snippet must look exactly like the final source code (for added lines) or the original source code (for removed lines).

--- WHAT TO LOOK FOR (SEVERITY) ---
1. **CRITICAL**:
   - Security vulnerabilities (SQL injection, XSS, exposed secrets/tokens).
   - Logic bugs that will crash the app (infinite loops, unhandled promises, null pointers).
   - Data loss risks.
   - *Trivial Fixes*: If the fix is obvious (e.g., typo, missing conversion), provide a \`suggestion\`.
2. **WARNING**:
   - Serious performance issues (N+1 queries, heavy loops).
   - Race conditions.
   - Breaking changes in API without fallback.
   - *Trivial Fixes*: If the fix is obvious, provide a \`suggestion\`.
3. **INFO**:
   - Extremely confusing code that needs a comment explaining "why".
   - If using deprecated libraries, provide a \`suggestion\` with the updated code.
   - Code that is not following best practices (e.g., using global variables, not using proper error handling).

--- RULES OF ENGAGEMENT ---
1. **Snippet Verification**: The content of \`snippet\` MUST exist in the diff (either added or removed lines). Do not fabricate code.
2. **Suggestion Clarity**: The \`suggestion\` field must be ready-to-commit code. Do NOT include comments like "// Fix" or "// Changes". Do NOT include markdown blocks. Just the code.
3. **Context**: Use the file headers to understand where you are (e.g., don't complain about 'console.log' in a frontend debug script, but complain in backend production code).
3. **Limit**: Maximum 30 comments. Prioritize CRITICAL over INFO.
4. **SILENCE**: If no critical, warning, or info issues are found, return an empty 'comments' array. Do not invent problems.
5. **Indentation**: The suggestion field must contain the code with the exact same indentation as the surrounding code in the diff.
6. **NO WRAPPERS**: Never use markdown code blocks (\`\`\`) inside the suggestion field. Provide the raw string only. If you need to suggest a multi-line change, use literal \\n characters.
`

  const MODEL_CONFIG = {
    model: '',
    contents: {
      role: 'user',
      parts: [{
        text: context,
      }],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: reviewSchema,
      systemInstruction: systemPrompt,
    },
  }

  logger.info('Sending request to Gemini', {
    context,
  })

  let responseText: string | undefined

  try {
    const response = await ai.models.generateContent({
      ...MODEL_CONFIG,
      model: 'gemini-3-flash-preview',
    })
    responseText = response.text
  }
  catch (error) {
    logger.error('Gemini 3 analysis failed:', { error })
  }

  if (!responseText) {
    try {
      const response = await ai.models.generateContent({
        ...MODEL_CONFIG,
        model: 'gemini-2.5-flash',
      })
      responseText = response.text
    }
    catch (error) {
      logger.error('Gemini 2.5 fallback analysis failed:', { error })
    }
  }

  if (!responseText) {
    throw new Error('Gemini response returned no text.')
  }

  logger.info('Received response from Gemini', { response: responseText })

  const reviewData = JSON.parse(responseText) as ReviewResult

  if (!Array.isArray(reviewData.comments)) {
    reviewData.comments = []
  }

  reviewData.comments = reviewData.comments.map(c => ({
    ...c,
    suggestion: c.suggestion?.replace(/```[\s\S]*?```/g, ''),
  }))

  return reviewData
}
