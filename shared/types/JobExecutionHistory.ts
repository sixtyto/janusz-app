export interface AiAttempt {
  model: string
  startedAt: string
  completedAt?: string
  failedAt?: string
  durationMs: number
  error?: string
  inputTokens?: number
  outputTokens?: number
}

export interface AgentExecution {
  agentType: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  attempts: AiAttempt[]
  totalDurationMs: number
  successfulModel?: string
  errorMessage?: string
  commentsFound: number
}

export interface OperationExecution {
  operationType: 'description_generation' | 'summary_generation' | 'context_selection' | 'reply_generation' | 'comment_verification'
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  attempts: AiAttempt[]
  totalDurationMs: number
  successfulModel?: string
  errorMessage?: string
}

export interface JobExecutionHistory {
  startedAt: string
  completedAt?: string
  totalDurationMs: number

  agentExecutions: AgentExecution[]
  executionMode: 'sequential' | 'parallel'

  operations: OperationExecution[]

  totalCommentsRaw: number
  totalCommentsMerged: number
  totalCommentsPosted: number

  totalInputTokens: number
  totalOutputTokens: number

  preferredModel?: string
  filesAnalyzed: number
}
