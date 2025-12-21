export interface ReviewComment {
  filename: string
  line?: number
  start_line?: number
  side?: 'LEFT' | 'RIGHT'
  snippet: string
  body: string
  suggestion?: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  confidence: number
}
