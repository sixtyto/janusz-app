<script setup lang="ts">
import type { LogEntry } from '#shared/types/LogEntry'
import type { TableColumn } from '@nuxt/ui'

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

const UBadge = resolveComponent('UBadge')

const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})

const columns: TableColumn<LogEntry>[] = [
  {
    accessorKey: 'timestamp',
    header: 'Time',
    cell: ({ row }) => h('span', { class: 'text-xs text-gray-500 whitespace-nowrap' }, mounted.value ? formatDate(row.original.timestamp) : ''),
  },
  {
    accessorKey: 'service',
    header: 'Service',
    cell: ({ row }) => h(UBadge, { color: 'neutral', variant: 'subtle', size: 'xs' }, () => row.original.service),
  },
  {
    accessorKey: 'level',
    header: 'Level',
    cell: ({ row }) => h(UBadge, { color: getLevelColor(row.original.level), variant: 'subtle', size: 'xs' }, () => row.original.level.toUpperCase()),
  },
  {
    accessorKey: 'message',
    header: 'Message',
    cell: ({ row }) => {
      const log = row.original
      const metaElements = []

      if (log.meta?.jobId) {
        metaElements.push(h('div', { class: 'mt-1 text-xs text-gray-400' }, `Job ID: ${log.meta.jobId}`))
      }

      if (log.meta?.error) {
        const error = log.meta.error
        const errorMessage = typeof error === 'object' ? (error.message || 'Unknown Error') : error

        metaElements.push(h('div', { class: 'mt-2 p-2 text-xs bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded border border-red-100 dark:border-red-900/50' }, [
          h('details', [
            h('summary', { class: 'cursor-pointer font-semibold' }, `Error: ${errorMessage}`),
            h('div', { class: 'mt-2' }, [
              (typeof error === 'object' && error.stack)
                ? h('pre', { class: 'overflow-x-auto opacity-75 p-2 bg-black/5 dark:bg-white/5 rounded' }, error.stack)
                : h('div', { class: 'opacity-75' }, String(error)),
            ]),
          ]),
        ]))
      }

      if (log.meta) {
        const otherMeta = Object.entries(log.meta)
          .filter(([key]) => key !== 'jobId' && key !== 'error')
          .map(([key, value]) => {
            const isLong = typeof value === 'string' && value.length > 100
            return h('div', { class: 'text-xs text-gray-600 dark:text-gray-300' }, [
              isLong
                ? h('details', [
                    h('summary', { class: 'cursor-pointer font-semibold hover:text-primary-500 transition-colors' }, [
                      `${key}: `,
                      h('span', { class: 'font-normal text-gray-500' }, '(click to expand)'),
                    ]),
                    h('pre', { class: 'mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 overflow-x-auto' }, String(value)),
                  ])
                : h('div', [
                    h('span', { class: 'font-semibold' }, `${key}: `),
                    String(value),
                  ]),
            ])
          })

        if (otherMeta.length > 0) {
          metaElements.push(h('div', { class: 'mt-2 space-y-1' }, otherMeta))
        }
      }

      return h('div', { class: 'max-w-2xl break-words whitespace-pre-wrap font-mono text-sm' }, [
        log.message,
        ...metaElements,
      ])
    },
  },
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
      />

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
