<script setup lang="ts">
import type { LogEntry, PaginatedLogsResponse } from '#shared/types/LogEntry'
import type { TableColumn } from '@nuxt/ui'

const page = ref(1)
const pageCount = ref(20)
const pageCountOptions = [
  { label: '10 / page', value: 10 },
  { label: '20 / page', value: 20 },
  { label: '50 / page', value: 50 },
  { label: '100 / page', value: 100 },
]

const selectedLevel = ref<string | undefined>(undefined)

const levelItems = [
  { label: 'All Levels', value: undefined },
  { label: 'Info', value: 'info' },
  { label: 'Warning', value: 'warn' },
  { label: 'Error', value: 'error' },
]

const { data, status, refresh, pending } = await useFetch<PaginatedLogsResponse>(() => '/api/logs', {
  query: computed(() => ({
    page: page.value,
    limit: pageCount.value,
    level: selectedLevel.value,
  })),
})

watch([selectedLevel, pageCount], () => {
  page.value = 1
})

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const toast = useToast()

async function copyLog(log: LogEntry) {
  const content = `[${formatDate(log.timestamp)}] ${log.level.toUpperCase()} [${log.service}]: ${log.message}\n${log.meta ? JSON.stringify(log.meta, null, 2) : ''}`
  if (!navigator?.clipboard) {
    return
  }
  try {
    await navigator.clipboard.writeText(content)
    toast.add({
      title: 'Copied to clipboard',
      duration: 2500,
      progress: false,
    })
  } catch {
    // silently
  }
}

const mounted = ref(false)
const autoRefresh = ref(true)

useIntervalFn(() => {
  if (autoRefresh.value && !pending.value) {
    refresh()
  }
}, 30_000)

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

      if (log.meta?.error) {
        const error = log.meta.error
        const errorMessage = (typeof error === 'object' && error !== null && 'message' in error) ? String(error.message) : String(error)

        metaElements.push(h('div', { class: 'mt-2 p-2 text-xs bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded border border-red-100 dark:border-red-900/50' }, [
          h('details', [
            h('summary', { class: 'cursor-pointer font-semibold' }, `Error: ${errorMessage}`),
            h('div', { class: 'mt-2' }, [
              (typeof error === 'object' && error !== null && 'stack' in error)
                ? h('pre', { class: 'overflow-x-auto opacity-75 p-2 bg-black/5 dark:bg-white/5 rounded' }, String(error.stack))
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

      if (log.meta?.jobId) {
        metaElements.push(h('div', { class: 'mt-1 text-xs text-gray-400' }, `Job ID: ${log.meta.jobId}`))
      }

      return h('div', { class: 'group relative pr-8' }, [
        h('div', { class: 'max-w-2xl break-words whitespace-pre-wrap font-mono text-sm' }, [
          log.message,
          ...metaElements,
        ]),
        h(UButton, {
          'icon': 'i-heroicons-clipboard-document',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'xs',
          'class': 'absolute top-0 right-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity',
          'aria-label': 'Copy log',
          'onClick': () => copyLog(log),
        }),
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
  title: 'Logs',
  middleware: [
    'auth',
  ],
})
</script>

<template>
  <div>
    <UCard data-testid="logs-card">
      <template #header>
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">
            Application Logs
          </h3>

          <div class="flex flex-wrap gap-2 items-center w-full sm:w-auto">
            <USelect
              v-model="selectedLevel"
              :items="levelItems"
              placeholder="Filter Level"
              class="w-full sm:w-32"
            />
            <USelect
              v-model="pageCount"
              :items="pageCountOptions"
              class="w-full sm:w-32"
            />
            <USwitch
              v-model="autoRefresh"
              color="primary"
              label="Auto-refresh"
            />
            <UButton
              icon="i-heroicons-arrow-path"
              variant="ghost"
              color="neutral"
              aria-label="Refresh logs"
              :loading="status === 'pending'"
              @click="() => refresh()"
            />
          </div>
        </div>
      </template>

      <div class="overflow-x-auto">
        <UTable
          :columns="columns"
          :data="data?.logs ?? []"
          :loading="status === 'pending'"
          class="w-full"
        />
      </div>

      <div class="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <div class="text-sm text-gray-500">
          Showing {{ data?.logs?.length ?? 0 }} of {{ data?.total ?? 0 }} logs
        </div>
        <UPagination
          v-if="(data?.total ?? 0) > 0"
          v-model:page="page"
          :items-per-page="pageCount"
          :total="data?.total ?? 0"
        />
      </div>

      <div
        v-if="!status && (data?.total ?? 0) === 0"
        class="p-4 text-center text-gray-500"
      >
        No logs found matching criteria.
      </div>
    </UCard>
  </div>
</template>
