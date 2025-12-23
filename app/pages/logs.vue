<script setup lang="ts">
import type { LogEntry } from '~~/server/api/logs.get'

const { setHeader } = usePageHeader()

setHeader('Logs')

const { data: logs, status, refresh } = await useFetch<LogEntry[]>('/api/logs')

const { data: repositories } = await useFetch('/api/repositories')

interface Repository {
  full_name: string
  [key: string]: any
}

const selectedRepository = ref<string | undefined>(undefined)
const repositoryItems = computed(() => {
  const repoData = repositories.value as Repository[] | null
  const items = repoData?.map(repo => ({
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

const page = ref(1)
const pageCount = ref(20)
const pageCountOptions = [
  { label: '10 / page', value: 10 },
  { label: '20 / page', value: 20 },
  { label: '50 / page', value: 50 },
  { label: '100 / page', value: 100 },
]

const paginatedLogs = computed(() => {
  const start = (page.value - 1) * pageCount.value
  const end = start + pageCount.value
  return filteredLogs.value.slice(start, end)
})

watch([selectedRepository, selectedLevel, pageCount], () => {
  page.value = 1
})

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

definePageMeta({
  middleware: [
    'auth',
  ],
})
</script>

<template>
  <div>
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
            <USelect
              v-model="pageCount"
              :items="pageCountOptions"
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
        :data="paginatedLogs"
        :columns="columns"
        :loading="status === 'pending'"
        class="w-full"
      >
        <template #timestamp-cell="{ row }">
          <ClientOnly>
            <span class="text-xs text-gray-500 whitespace-nowrap">
              {{ formatDate((row.original as LogEntry).timestamp) }}
            </span>
          </ClientOnly>
        </template>

        <template #service-cell="{ row }">
          <UBadge
            color="neutral"
            variant="subtle"
            size="xs"
          >
            {{ (row.original as LogEntry).service }}
          </UBadge>
        </template>

        <template #level-cell="{ row }">
          <UBadge
            :color="getLevelColor((row.original as LogEntry).level)"
            variant="subtle"
            size="xs"
          >
            {{ (row.original as LogEntry).level.toUpperCase() }}
          </UBadge>
        </template>

        <template #message-cell="{ row }">
          <div class="max-w-2xl break-words whitespace-pre-wrap font-mono text-sm">
            {{ (row.original as LogEntry).message }}
            <div
              v-if="(row.original as LogEntry).meta?.jobId"
              class="mt-1 text-xs text-gray-400"
            >
              Job ID: {{ (row.original as LogEntry).meta?.jobId }}
            </div>
            <div
              v-if="(row.original as LogEntry).meta?.error"
              class="mt-2 p-2 text-xs bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded border border-red-100 dark:border-red-900/50"
            >
              <details>
                <summary class="cursor-pointer font-semibold">
                  Error: {{ (typeof (row.original as LogEntry).meta?.error === 'object' ? (row.original as LogEntry).meta?.error?.message : (row.original as LogEntry).meta?.error) || 'Unknown Error' }}
                </summary>
                <div class="mt-2">
                  <pre
                    v-if="typeof (row.original as LogEntry).meta?.error === 'object' && (row.original as LogEntry).meta?.error?.stack"
                    class="overflow-x-auto opacity-75 p-2 bg-black/5 dark:bg-white/5 rounded"
                  >{{ (row.original as LogEntry).meta?.error.stack }}</pre>
                  <div
                    v-else-if="typeof (row.original as LogEntry).meta?.error === 'object'"
                    class="opacity-75"
                  >
                    {{ (row.original as LogEntry).meta?.error }}
                  </div>
                </div>
              </details>
            </div>

            <div
              v-if="(row.original as LogEntry).meta"
              class="mt-2 space-y-1"
            >
              <template
                v-for="(value, key) in (row.original as LogEntry).meta"
                :key="key"
              >
                <div
                  v-if="key !== 'jobId' && key !== 'error'"
                  class="text-xs text-gray-600 dark:text-gray-300"
                >
                  <template v-if="typeof value === 'string' && value.length > 100">
                    <details>
                      <summary class="cursor-pointer font-semibold hover:text-primary-500 transition-colors">
                        {{ key }}: <span class="font-normal text-gray-500">(click to expand)</span>
                      </summary>
                      <pre class="mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 overflow-x-auto">{{ value }}</pre>
                    </details>
                  </template>
                  <template v-else>
                    <span class="font-semibold">{{ key }}:</span> {{ value }}
                  </template>
                </div>
              </template>
            </div>
          </div>
        </template>
      </UTable>
      <div class="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <div class="text-sm text-gray-500">
          Showing {{ paginatedLogs.length }} of {{ filteredLogs.length }} logs
        </div>
        <UPagination
          v-if="filteredLogs.length > 0"
          v-model:page="page"
          :items-per-page="pageCount"
          :total="filteredLogs.length"
        />
      </div>

      <div
        v-if="!status && filteredLogs.length === 0"
        class="p-4 text-center text-gray-500"
      >
        No logs found matching criteria.
      </div>
    </UCard>
  </div>
</template>
