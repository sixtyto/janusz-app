import parseDiff from 'parse-diff'
import { normalizeCode } from './normalizeCode'

function findBestMatch(files: any[], snippetLines: string[]) {
  let globalBestMatch: { endLine: number, startLine: number, addCount: number } | null = null

  for (const file of files) {
    const candidateLines: { content: string, number: number, type: 'add' | 'normal' }[] = []

    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        if (change.type === 'del') {
          continue
        }

        const lineContent = change.content.substring(1)
        const lineNumber = change.type === 'normal' ? change.ln2 : change.ln
        candidateLines.push({
          content: lineContent,
          number: lineNumber,
          type: change.type as 'add' | 'normal',
        })
      }
    }

    if (snippetLines.length > candidateLines.length) {
      continue
    }

    for (let i = 0; i <= candidateLines.length - snippetLines.length; i++) {
      let match = true
      let currentMatchAddCount = 0

      for (let j = 0; j < snippetLines.length; j++) {
        if (normalizeCode(candidateLines[i + j].content) !== snippetLines[j]) {
          match = false
          break
        }
        if (candidateLines[i + j].type === 'add') {
          currentMatchAddCount++
        }
      }

      if (match) {
        if (globalBestMatch === null || currentMatchAddCount > globalBestMatch.addCount) {
          globalBestMatch = {
            startLine: candidateLines[i].number,
            endLine: candidateLines[i + snippetLines.length - 1].number,
            addCount: currentMatchAddCount,
          }
        }
      }
    }
  }

  return globalBestMatch
}

export function getLineNumberFromPatch(patch: string, snippet: string): { line: number, start_line?: number } | null {
  if (!patch || !snippet) {
    return null
  }

  const files = parseDiff(patch)
  if (!files || files.length === 0) {
    return null
  }

  const snippetLinesExact = snippet.split('\n').map(normalizeCode)
  const matchLinesExact = findBestMatch(files, snippetLinesExact)

  if (matchLinesExact) {
    if (matchLinesExact.startLine === matchLinesExact.endLine) {
      return { line: matchLinesExact.endLine }
    }
    return { line: matchLinesExact.endLine, start_line: matchLinesExact.startLine }
  }

  if (snippet.includes('\\n')) {
    const snippetLinesUnescaped = snippet.replace(/\\n/g, '\n').split('\n').map(normalizeCode)
    const matchLinesUnescaped = findBestMatch(files, snippetLinesUnescaped)

    if (matchLinesUnescaped) {
      if (matchLinesUnescaped.startLine === matchLinesUnescaped.endLine) {
        return { line: matchLinesUnescaped.endLine }
      }
      return { line: matchLinesUnescaped.endLine, start_line: matchLinesUnescaped.startLine }
    }
  }

  return null
}
