import type { JobExecutionHistory } from './JobExecutionHistory'
import type { JobStatus } from './JobStatus'

export interface JobDataSummary {
  repositoryFullName: string
  installationId: number
  prNumber: number
  headSha?: string
  action?: string
  type?: string
  commentId?: number
}

export interface JobDto {
  id: string
  name: string
  data: JobDataSummary
  attemptsMade: number
  failedReason?: string
  processedAt?: string
  finishedAt?: string
  state: JobStatus
  progress: number
  timestamp: string
  executionHistory?: JobExecutionHistory
}
