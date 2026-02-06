<script setup lang="ts">
import type { JobExecutionHistory } from '#shared/types/JobExecutionHistory'

defineProps<{
  history: JobExecutionHistory
}>()
</script>

<template>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <UCard>
      <div class="text-center">
        <div class="text-2xl font-bold text-primary">
          {{ formatDuration(history.totalDurationMs) }}
        </div>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Total duration
        </div>
      </div>
    </UCard>

    <UCard>
      <div class="text-center">
        <div class="text-2xl font-bold text-emerald-500">
          {{ formatTokens(history.totalInputTokens + history.totalOutputTokens) }}
        </div>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Tokens ({{ formatTokens(history.totalInputTokens) }} in / {{ formatTokens(history.totalOutputTokens) }} out)
        </div>
      </div>
    </UCard>

    <UCard>
      <div class="text-center">
        <div class="text-2xl font-bold text-blue-500">
          {{ history.filesAnalyzed }}
        </div>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Files analyzed
        </div>
      </div>
    </UCard>

    <UCard>
      <div class="text-center">
        <div class="text-2xl font-bold text-amber-500">
          {{ history.totalCommentsPosted }} / {{ history.totalCommentsRaw }}
        </div>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Comments (posted / raw)
        </div>
      </div>
    </UCard>
  </div>
</template>
