import type { ReviewComment } from './ReviewComment'

export interface ReviewResult {
  comments: ReviewComment[]
  summary: string
}
