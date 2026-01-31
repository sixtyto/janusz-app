import type { Severity } from '#shared/types/severity'

export interface ReviewComment {
  filename: string
  line?: number
  start_line?: number
  side?: 'LEFT' | 'RIGHT'
  snippet: string
  body: string
  suggestion?: string
  severity: Severity
  confidence: number
}
