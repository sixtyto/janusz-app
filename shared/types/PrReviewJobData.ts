export interface PrReviewJobData {
  repositoryFullName: string
  installationId: number
  prNumber: number
  headSha: string
  action: 'opened' | 'synchronize'
}
