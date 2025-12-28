import type { GitHubAction } from './GitHubEvents'
import type { JobType } from './JobType'

export interface PrReviewJobData {
  repositoryFullName: string
  installationId: number
  prNumber: number
  headSha: string
  action: GitHubAction
  type: JobType
  commentId?: number
}
