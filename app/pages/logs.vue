<script setup lang="ts">
import type { LogEntry } from '~~/server/api/logs.get'

const { user, clear } = useUserSession()

const { data: logs, status, refresh } = await useFetch<LogEntry[]>('/api/logs', {
  immediate: true,
})

const { data: repositories } = await useFetch('/api/repositories')

const selectedRepository = ref<string | undefined>(undefined)
const repositoryItems = computed(() => {
  const repoData = repositories.value as unknown as any[]
  const items = repoData?.map((repo: any) => ({
    label: repo.full_name,
    value: repo.full_name,
  })) || []

  return [
    {
      label: 'All Repositories',
      value: undefined,
    },
    ...items,
  ]
})

const selectedLevel = ref<string | undefined>(undefined)
const levelItems = [
  { label: 'All Levels', value: undefined },
  { label: 'Info', value: 'info' },
  { label: 'Warning', value: 'warn' },
  { label: 'Error', value: 'error' },
]

const filteredLogs = computed(() => {
  if (!logs.value)
    return []

  return logs.value.filter((log) => {
    if (selectedRepository.value && log.service !== selectedRepository.value) {
      return false
    }
    if (selectedLevel.value && log.level !== selectedLevel.value) {
      return false
    }
    return true
  })
})

// Table configuration
const columns = [
  { accessorKey: 'timestamp', header: 'Time' },
  { accessorKey: 'service', header: 'Service' },
  { accessorKey: 'level', header: 'Level' },
  { accessorKey: 'message', header: 'Message' },
]

function getLevelColor(level: string) {
  switch (level) {
    case 'error': return 'error'
    case 'warn': return 'warning'
    case 'info': return 'primary'
    default: return 'neutral'
  }
}

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleString()
}

definePageMeta({
  middleware: [
    'auth',
  ],
})
</script>

<template>
  <div class="p-4 max-w-7xl mx-auto space-y-6">
    <header class="flex justify-between items-center bg-white dark:bg-gray-900 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          Logs
        </h1>
        <p class="text-gray-500 dark:text-gray-400 text-sm mt-1">
          System logs for {{ user?.name }}
        </p>
      </div>
      <div class="flex gap-2">
        <UButton
          to="/"
          icon="i-heroicons-home"
          color="neutral"
          variant="ghost"
        >
          Dashboard
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-heroicons-arrow-right-start-on-rectangle-20-solid"
          label="Logout"
          @click="clear"
        />
      </div>
    </header>

    <UCard>
      <template #header>
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">
            Application Logs
          </h3>

          <div class="flex gap-2 w-full sm:w-auto">
            <USelect
              v-model="selectedRepository"
              :items="repositoryItems"
              placeholder="Filter Repository"
              class="w-48"
            />
            <USelect
              v-model="selectedLevel"
              :items="levelItems"
              placeholder="Filter Level"
              class="w-32"
            />
            <UButton
              icon="i-heroicons-arrow-path"
              variant="ghost"
              color="neutral"
              :loading="status === 'pending'"
              @click="() => refresh()"
            />
          </div>
        </div>
      </template>

      <UTable
        :data="filteredLogs"
        :columns="columns"
        :loading="status === 'pending'"
        class="w-full"
      >
        <template #timestamp-cell="{ row }">
          <span class="text-xs text-gray-500 whitespace-nowrap">
            {{ formatDate((row.original as LogEntry).timestamp) }}
          </span>
        </template>

        <template #service-cell="{ row }">
          <UBadge color="neutral" variant="subtle" size="xs">
            {{ (row.original as LogEntry).service }}
          </UBadge>
        </template>

        <template #level-cell="{ row }">
          <UBadge :color="getLevelColor((row.original as LogEntry).level)" variant="subtle" size="xs">
            {{ (row.original as LogEntry).level.toUpperCase() }}
          </UBadge>
        </template>

        <template #message-cell="{ row }">
          <div class="max-w-2xl break-words whitespace-pre-wrap font-mono text-sm">
            {{ (row.original as LogEntry).message }}
            <div v-if="(row.original as LogEntry).jobId" class="mt-1 text-xs text-gray-400">
              Job ID: {{ (row.original as LogEntry).jobId }}
            </div>
          </div>
        </template>
      </UTable>

      <div v-if="!status && filteredLogs.length === 0" class="p-4 text-center text-gray-500">
        No logs found matching criteria.
      </div>
    </UCard>
  </div>
</template>
