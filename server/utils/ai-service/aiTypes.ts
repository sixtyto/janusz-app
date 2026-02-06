import type { BaseMessage } from '@langchain/core/messages'

interface MessageWithUsageMetadata extends BaseMessage {
  usage_metadata?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
  }
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface AiResponse<T> {
  result: T
  usage: TokenUsage
  model: string
  durationMs: number
}

export function extractTokenUsage(rawMessage: MessageWithUsageMetadata): TokenUsage {
  const usage = rawMessage?.usage_metadata
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
  }
}

interface CreateAiResponseParams<T> {
  parsed: T
  raw: MessageWithUsageMetadata
  modelName: string
  durationMs: number
}

export function createAiResponse<T>(params: CreateAiResponseParams<T>): AiResponse<T> {
  return {
    result: params.parsed,
    usage: extractTokenUsage(params.raw),
    model: params.modelName,
    durationMs: params.durationMs,
  }
}
