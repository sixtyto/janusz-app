export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
} as const

export const DEFAULT_MAX_REVIEW_COMMENTS = 30
