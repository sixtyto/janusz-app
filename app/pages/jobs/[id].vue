<script setup lang="ts">
import type { JobDto } from '#shared/types/JobDto'

const route = useRoute()
const jobId = computed(() => route.params.id as string)

const { data: job, pending, error } = await useFetch<JobDto>(`/api/jobs/${jobId.value}`)

const UBadge = resolveComponent('UBadge')

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    completed: 'success',
    failed: 'error',
    active: 'info',
    waiting: 'warning',
    delayed: 'neutral',
  }
  return colors[status] || 'neutral'
}

definePageMeta({
  title: 'Job Details',
  middleware: ['auth'],
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-4">
      <UButton
        to="/jobs"
        icon="i-heroicons-arrow-left"
        color="neutral"
        variant="ghost"
        size="sm"
      >
        Back to list
      </UButton>
    </div>

    <UAlert
      v-if="error"
      title="Error loading"
      :description="error.message"
      color="error"
      variant="subtle"
      icon="i-heroicons-exclamation-triangle"
    />

    <div
      v-if="pending"
      class="flex justify-center py-12"
    >
      <UIcon
        name="i-heroicons-arrow-path"
        class="w-8 h-8 animate-spin text-gray-400"
      />
    </div>

    <template v-else-if="job">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-xl font-semibold">
                Job #{{ job.id.slice(0, 8) }}
              </h1>
              <div class="flex items-center gap-2 mt-1 text-sm text-gray-500">
                <UIcon
                  name="i-heroicons-folder"
                  class="w-4 h-4"
                />
                <span>{{ job.data.repositoryFullName }}</span>
                <span class="mx-2">•</span>
                <span>PR #{{ job.data.prNumber }}</span>
              </div>
            </div>
            <UBadge
              :color="getStatusColor(job.state)"
              variant="subtle"
              size="lg"
            >
              {{ job.state }}
            </UBadge>
          </div>
        </template>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div class="text-gray-500 dark:text-gray-400">
              Created
            </div>
            <div class="font-medium">
              {{ formatDateTime(job.timestamp) }}
            </div>
          </div>
          <div v-if="job.processedAt">
            <div class="text-gray-500 dark:text-gray-400">
              Started
            </div>
            <div class="font-medium">
              {{ formatDateTime(job.processedAt) }}
            </div>
          </div>
          <div v-if="job.finishedAt">
            <div class="text-gray-500 dark:text-gray-400">
              Finished
            </div>
            <div class="font-medium">
              {{ formatDateTime(job.finishedAt) }}
            </div>
          </div>
          <div>
            <div class="text-gray-500 dark:text-gray-400">
              Attempts
            </div>
            <div class="font-medium">
              {{ job.attemptsMade }}
            </div>
          </div>
        </div>

        <div
          v-if="job.failedReason"
          class="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300 text-sm"
        >
          <strong>Error:</strong> {{ job.failedReason }}
        </div>
      </UCard>

      <template v-if="job.executionHistory">
        <h2 class="text-lg font-medium">
          Execution Statistics
        </h2>
        <JobExecutionStats :history="job.executionHistory" />

        <h2 class="text-lg font-medium">
          Execution Timeline
        </h2>
        <JobExecutionTimeline :history="job.executionHistory" />
      </template>

      <UAlert
        v-else
        title="No execution history"
        description="This job does not have execution history recorded yet. It may be in progress or history was not collected."
        color="info"
        variant="subtle"
        icon="i-heroicons-information-circle"
      />
    </template>
  </div>
</template>
