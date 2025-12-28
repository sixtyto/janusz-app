import type { JobStatus } from './JobStatus'
import type { PrReviewJobData } from './PrReviewJobData'

export interface JobDto {
  id: string
  name: string
  data: PrReviewJobData
  status: string
  repositoryFullName: string
  attemptsMade: number
  failedReason?: string
  finishedOn?: number
  processedOn?: number
  returnvalue?: any
  state: JobStatus
  progress?: number | object
  timestamp: number
}
