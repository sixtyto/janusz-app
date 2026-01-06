import type { LogLevel } from './LogLevel'
import type { ServiceType } from './ServiceType'

export interface LogMeta {
  installationId: number
  jobId?: string
  error?: unknown
  [key: string]: unknown
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  service: ServiceType
  message: string
  meta?: LogMeta
}
