import type {
  AgentExecution,
  AiAttempt,
  JobExecutionHistory,
  OperationExecution,
} from '#shared/types/JobExecutionHistory'
import { useLogger } from '~~/server/utils/useLogger'
import { ServiceType } from '~~/shared/types/ServiceType'

const logger = useLogger(ServiceType.worker)

export interface JobExecutionCollector {
  startAgent: (agentType: string) => void
  recordAgentAttempt: (agentType: string, attempt: AiAttempt) => void
  completeAgent: (agentType: string, commentsFound: number) => void
  failAgent: (agentType: string, errorMessage: string) => void

  startOperation: (operationType: OperationExecution['operationType']) => void
  recordOperationAttempt: (operationType: OperationExecution['operationType'], attempt: AiAttempt) => void
  completeOperation: (operationType: OperationExecution['operationType']) => void
  failOperation: (operationType: OperationExecution['operationType'], errorMessage: string) => void

  setCommentStats: (raw: number, merged: number, posted: number) => void

  finalize: () => JobExecutionHistory
}

interface CollectorOptions {
  preferredModel?: string
  executionMode: 'sequential' | 'parallel'
  filesAnalyzed: number
}

export function createJobExecutionCollector(options: CollectorOptions): JobExecutionCollector {
  const startedAt = new Date().toISOString()
  const agentExecutions = new Map<string, AgentExecution>()
  const operations = new Map<OperationExecution['operationType'], OperationExecution>()

  let totalCommentsRaw = 0
  let totalCommentsMerged = 0
  let totalCommentsPosted = 0

  function getOrCreateAgent(agentType: string): AgentExecution {
    let agent = agentExecutions.get(agentType)
    if (!agent) {
      agent = {
        agentType,
        status: 'pending',
        attempts: [],
        totalDurationMs: 0,
        commentsFound: 0,
      }
      agentExecutions.set(agentType, agent)
    }
    return agent
  }

  function getOrCreateOperation(operationType: OperationExecution['operationType']): OperationExecution {
    let operation = operations.get(operationType)
    if (!operation) {
      operation = {
        operationType,
        status: 'pending',
        attempts: [],
        totalDurationMs: 0,
      }
      operations.set(operationType, operation)
    }
    return operation
  }

  function calculateTotalTokens(
    agents: AgentExecution[],
    ops: OperationExecution[],
  ): { inputTokens: number, outputTokens: number } {
    let inputTokens = 0
    let outputTokens = 0

    for (const agent of agents) {
      for (const attempt of agent.attempts) {
        inputTokens += attempt.inputTokens ?? 0
        outputTokens += attempt.outputTokens ?? 0
      }
    }

    for (const op of ops) {
      for (const attempt of op.attempts) {
        inputTokens += attempt.inputTokens ?? 0
        outputTokens += attempt.outputTokens ?? 0
      }
    }

    return { inputTokens, outputTokens }
  }

  return {
    startAgent(agentType: string): void {
      const agent = getOrCreateAgent(agentType)
      agent.status = 'running'
    },

    recordAgentAttempt(agentType: string, attempt: AiAttempt): void {
      const agent = getOrCreateAgent(agentType)
      agent.attempts.push(attempt)
      agent.totalDurationMs += attempt.durationMs
    },

    completeAgent(agentType: string, commentsFound: number): void {
      const agent = getOrCreateAgent(agentType)
      agent.status = 'completed'
      agent.commentsFound = commentsFound

      const successfulAttempt = agent.attempts.find(a => a.completedAt && !a.failedAt)
      if (successfulAttempt) {
        agent.successfulModel = successfulAttempt.model
      }
    },

    failAgent(agentType: string, errorMessage: string): void {
      const agent = getOrCreateAgent(agentType)
      agent.status = 'failed'
      agent.errorMessage = errorMessage
    },

    startOperation(operationType: OperationExecution['operationType']): void {
      const operation = getOrCreateOperation(operationType)
      operation.status = 'running'
    },

    recordOperationAttempt(operationType: OperationExecution['operationType'], attempt: AiAttempt): void {
      const operation = getOrCreateOperation(operationType)
      operation.attempts.push(attempt)
      operation.totalDurationMs += attempt.durationMs
    },

    completeOperation(operationType: OperationExecution['operationType']): void {
      const operation = getOrCreateOperation(operationType)
      operation.status = 'completed'

      const successfulAttempt = operation.attempts.find(a => a.completedAt && !a.failedAt)
      if (successfulAttempt) {
        operation.successfulModel = successfulAttempt.model
      }
    },

    failOperation(operationType: OperationExecution['operationType'], errorMessage: string): void {
      const operation = getOrCreateOperation(operationType)
      operation.status = 'failed'
      operation.errorMessage = errorMessage
    },

    setCommentStats(raw: number, merged: number, posted: number): void {
      totalCommentsRaw = raw
      totalCommentsMerged = merged
      totalCommentsPosted = posted
    },

    finalize(): JobExecutionHistory {
      const completedAt = new Date().toISOString()
      const agentList = Array.from(agentExecutions.values())
      const operationList = Array.from(operations.values())

      if (agentList.length === 0 && operationList.length === 0) {
        logger.warn('⚠️ No agents or operations were recorded in execution history')
      }
      const incompleteAgents = agentList.filter(agent => agent.status === 'pending' || agent.status === 'running')
      if (incompleteAgents.length > 0) {
        logger.warn(`⚠️ ${incompleteAgents.length} agent(s) have incomplete status (pending/running)`, {
          agents: incompleteAgents.map(a => a.agentType),
        })
      }
      const incompleteOperations = operationList.filter(op => op.status === 'pending' || op.status === 'running')
      if (incompleteOperations.length > 0) {
        logger.warn(`⚠️ ${incompleteOperations.length} operation(s) have incomplete status (pending/running)`, {
          operations: incompleteOperations.map(o => o.operationType),
        })
      }

      const { inputTokens, outputTokens } = calculateTotalTokens(agentList, operationList)

      if (inputTokens < 0 || outputTokens < 0) {
        logger.warn('⚠️ Negative token counts detected in execution history', {
          inputTokens,
          outputTokens,
        })
      }

      return {
        startedAt,
        completedAt,
        totalDurationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
        agentExecutions: agentList,
        executionMode: options.executionMode,
        operations: operationList,
        totalCommentsRaw,
        totalCommentsMerged,
        totalCommentsPosted,
        totalInputTokens: Math.max(0, inputTokens),
        totalOutputTokens: Math.max(0, outputTokens),
        preferredModel: options.preferredModel,
        filesAnalyzed: options.filesAnalyzed,
      }
    },
  }
}
