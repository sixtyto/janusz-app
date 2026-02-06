<script setup lang="ts">
import type { AgentExecution, AiAttempt, JobExecutionHistory, OperationExecution } from '#shared/types/JobExecutionHistory'

defineProps<{
  history: JobExecutionHistory
}>()

interface TimelineItem {
  type: 'agent' | 'operation'
  name: string
  status: AgentExecution['status'] | OperationExecution['status']
  durationMs: number
  attempts: AiAttempt[]
  successfulModel?: string
  errorMessage?: string
  commentsFound?: number
}

function buildTimelineItems(history: JobExecutionHistory): TimelineItem[] {
  const items: TimelineItem[] = []

  for (const agent of history.agentExecutions) {
    items.push({
      type: 'agent',
      name: agent.agentType,
      status: agent.status,
      durationMs: agent.totalDurationMs,
      attempts: agent.attempts,
      successfulModel: agent.successfulModel,
      errorMessage: agent.errorMessage,
      commentsFound: agent.commentsFound,
    })
  }

  for (const operation of history.operations) {
    items.push({
      type: 'operation',
      name: operation.operationType.replace(/_/g, ' '),
      status: operation.status,
      durationMs: operation.totalDurationMs,
      attempts: operation.attempts,
      successfulModel: operation.successfulModel,
      errorMessage: operation.errorMessage,
    })
  }

  return items
}

function getStatusColor(status: TimelineItem['status']): 'neutral' | 'info' | 'success' | 'error' | 'warning' {
  const colors: Record<TimelineItem['status'], 'neutral' | 'info' | 'success' | 'error' | 'warning'> = {
    pending: 'neutral',
    running: 'info',
    completed: 'success',
    failed: 'error',
    skipped: 'warning',
  }
  return colors[status]
}

function getStatusIcon(status: TimelineItem['status']): string {
  const icons: Record<TimelineItem['status'], string> = {
    pending: 'i-heroicons-clock',
    running: 'i-heroicons-arrow-path',
    completed: 'i-heroicons-check-circle',
    failed: 'i-heroicons-x-circle',
    skipped: 'i-heroicons-minus-circle',
  }
  return icons[status]
}

const expandedItems = ref<Set<number>>(new Set())

function toggleExpand(index: number) {
  if (expandedItems.value.has(index)) {
    expandedItems.value.delete(index)
  } else {
    expandedItems.value.add(index)
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
      <UIcon name="i-heroicons-cpu-chip" />
      <span>Mode: {{ history.executionMode }}</span>
      <span
        v-if="history.preferredModel"
        class="ml-4"
      >
        Preferred model: {{ history.preferredModel }}
      </span>
    </div>

    <div class="relative">
      <div class="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />

      <div
        v-for="(item, index) in buildTimelineItems(history)"
        :key="index"
        class="relative pl-10 pb-6 last:pb-0"
      >
        <div
          class="absolute left-2 w-5 h-5 rounded-full flex items-center justify-center"
          :class="{
            'bg-green-100 dark:bg-green-900': item.status === 'completed',
            'bg-red-100 dark:bg-red-900': item.status === 'failed',
            'bg-blue-100 dark:bg-blue-900': item.status === 'running',
            'bg-gray-100 dark:bg-gray-800': item.status === 'pending' || item.status === 'skipped',
          }"
        >
          <UIcon
            :name="getStatusIcon(item.status)"
            class="w-3 h-3"
            :class="{
              'text-green-600 dark:text-green-400': item.status === 'completed',
              'text-red-600 dark:text-red-400': item.status === 'failed',
              'text-blue-600 dark:text-blue-400': item.status === 'running',
              'text-gray-500': item.status === 'pending' || item.status === 'skipped',
            }"
          />
        </div>

        <UCard
          class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          @click="toggleExpand(index)"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <UBadge
                :color="item.type === 'agent' ? 'primary' : 'neutral'"
                variant="subtle"
                size="xs"
              >
                {{ item.type }}
              </UBadge>
              <span class="font-medium capitalize">{{ item.name }}</span>
            </div>

            <div class="flex items-center gap-3">
              <span
                v-if="item.commentsFound !== undefined"
                class="text-sm text-gray-500"
              >
                {{ item.commentsFound }} comments
              </span>
              <span class="text-sm text-gray-500">
                {{ formatDuration(item.durationMs) }}
              </span>
              <UBadge
                :color="getStatusColor(item.status)"
                variant="subtle"
                size="xs"
              >
                {{ item.status }}
              </UBadge>
              <UIcon
                :name="expandedItems.has(index) ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                class="w-4 h-4 text-gray-400"
              />
            </div>
          </div>

          <div
            v-if="item.successfulModel"
            class="mt-2 text-sm text-gray-500"
          >
            Model: {{ item.successfulModel }}
          </div>

          <div
            v-if="item.errorMessage"
            class="mt-2 text-sm text-red-500 dark:text-red-400"
          >
            {{ item.errorMessage }}
          </div>

          <div
            v-if="expandedItems.has(index) && item.attempts.length > 0"
            class="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4"
          >
            <div class="text-sm font-medium mb-2">
              Attempts ({{ item.attempts.length }})
            </div>
            <div class="space-y-2">
              <div
                v-for="(attempt, attemptIndex) in item.attempts"
                :key="attemptIndex"
                class="flex items-center justify-between text-sm p-2 rounded bg-gray-50 dark:bg-gray-800"
              >
                <div class="flex items-center gap-2">
                  <UIcon
                    :name="attempt.failedAt ? 'i-heroicons-x-circle' : 'i-heroicons-check-circle'"
                    :class="attempt.failedAt ? 'text-red-500' : 'text-green-500'"
                    class="w-4 h-4"
                  />
                  <span class="font-mono text-xs">{{ attempt.model }}</span>
                </div>
                <div class="flex items-center gap-4 text-gray-500">
                  <span v-if="attempt.inputTokens || attempt.outputTokens">
                    {{ formatTokens(attempt.inputTokens ?? 0) }} / {{ formatTokens(attempt.outputTokens ?? 0) }} tokens
                  </span>
                  <span>{{ formatDuration(attempt.durationMs) }}</span>
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>
