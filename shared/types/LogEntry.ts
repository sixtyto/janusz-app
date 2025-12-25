import type { LogLevel } from './LogLevel'
import type { ServiceType } from './ServiceType'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  service: ServiceType
  message: string
  meta?: Record<string, any>
}
