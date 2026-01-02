import type { File } from 'parse-diff'
import parseDiff from 'parse-diff'
import { normalizeCode } from './normalizeCode'

interface MatchResult {
  line: number
  start_line?: number
  side: 'LEFT' | 'RIGHT'
}

function findBestMatch(files: File[], snippetLines: string[]) {
  let globalBestMatch: { endLine: number, startLine: number, side: 'LEFT' | 'RIGHT', score: number } | null = null

  for (const file of files) {
    const candidateLines: { content: string, number: number, side: 'LEFT' | 'RIGHT', type: 'add' | 'del' | 'normal' }[] = []

    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        const lineContent = change.content.substring(1)

        if (change.type === 'del') {
          candidateLines.push({
            content: lineContent,
            number: change.ln,
            side: 'LEFT',
            type: 'del',
          })
        } else if (change.type === 'add') {
          candidateLines.push({
            content: lineContent,
            number: change.ln,
            side: 'RIGHT',
            type: 'add',
          })
        } else if (change.type === 'normal') {
          candidateLines.push({
            content: lineContent,
            number: change.ln2,
            side: 'RIGHT',
            type: 'normal',
          })
        }
      }
    }

    if (snippetLines.length > candidateLines.length) {
      continue
    }

    for (let i = 0; i <= candidateLines.length - snippetLines.length; i++) {
      let match = true
      let score = 0

      for (let j = 0; j < snippetLines.length; j++) {
        const candidate = candidateLines[i + j]
        if (!candidate || normalizeCode(candidate.content) !== snippetLines[j]) {
          match = false
          break
        }

        if (candidate.type === 'add') {
          score += 2
        } else if (candidate.type === 'del') {
          score += 2
        } else {
          score += 1
        }
      }

      if (match) {
        const anchorLine = candidateLines[i + snippetLines.length - 1]
        const startLineCandidate = candidateLines[i]

        if (!anchorLine || !startLineCandidate) {
          continue
        }

        if (globalBestMatch === null || score > globalBestMatch.score) {
          globalBestMatch = {
            startLine: startLineCandidate.number,
            endLine: anchorLine.number,
            side: anchorLine.side,
            score,
          }
        }
      }
    }
  }

  return globalBestMatch
}

export function getLineNumberFromPatch(patch: string, snippet: string): MatchResult | null {
  if (!patch || !snippet) {
    return null
  }

  const files = parseDiff(patch)
  if (files.length === 0) {
    return null
  }

  const snippetLinesExact = snippet.split('\n').map(normalizeCode)
  const matchLinesExact = findBestMatch(files, snippetLinesExact)

  if (matchLinesExact) {
    if (matchLinesExact.startLine === matchLinesExact.endLine) {
      return { line: matchLinesExact.endLine, side: matchLinesExact.side }
    }
    return { line: matchLinesExact.endLine, start_line: matchLinesExact.startLine, side: matchLinesExact.side }
  }

  if (snippet.includes('\\n')) {
    const snippetLinesUnescaped = snippet.replace(/\\n/g, '\n').split('\n').map(normalizeCode)
    const matchLinesUnescaped = findBestMatch(files, snippetLinesUnescaped)

    if (matchLinesUnescaped) {
      if (matchLinesUnescaped.startLine === matchLinesUnescaped.endLine) {
        return { line: matchLinesUnescaped.endLine, side: matchLinesUnescaped.side }
      }
      return { line: matchLinesUnescaped.endLine, start_line: matchLinesUnescaped.startLine, side: matchLinesUnescaped.side }
    }
  }

  return null
}
