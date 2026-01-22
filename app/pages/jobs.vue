<script setup lang="ts">
import type { JobDto } from '#shared/types/JobDto'
import type { TableColumn } from '@nuxt/ui'
import { JobStatus } from '#shared/types/JobStatus'

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const columns: TableColumn<JobDto>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Job Name' },
  {
    accessorKey: 'repositoryFullName',
    header: 'Repo',
    cell: ({ row }) => row.original.data?.repositoryFullName || '-',
  },
  { accessorKey: 'data.prNumber', header: 'PR #' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.original.state
      return h(UBadge, {
        color: getStatusColor(status),
        variant: 'subtle',
      }, () => status)
    },
  },
  { accessorKey: 'attemptsMade', header: 'Attempts' },
  {
    accessorKey: 'actions',
    header: 'Actions',
    cell: ({ row }) => {
      return h('div', { class: 'flex gap-2' }, [
        h(UButton, {
          size: 'xs',
          color: 'neutral',
          variant: 'ghost',
          icon: 'i-heroicons-command-line',
          onClick: () => openLogs(row.original),
        }, () => 'Logs'),
        (row.original.failedReason || row.original.state === JobStatus.FAILED)
          ? h(UButton, {
              size: 'xs',
              color: 'warning',
              variant: 'ghost',
              icon: 'i-heroicons-arrow-path',
              onClick: () => openRetryModal(row.original),
            }, () => 'Retry')
          : null,
        h(UButton, {
          size: 'xs',
          color: 'error',
          variant: 'ghost',
          icon: 'i-heroicons-trash',
          onClick: () => openDeleteModal(row.original),
        }, () => 'Delete'),
      ])
    },
  },
]

const page = ref(1)
const pageCount = ref(20)
const selectedStatus = ref<JobStatus | undefined>(undefined)
const statusOptions = [
  { label: 'All', value: undefined },
  { label: 'Active', value: JobStatus.ACTIVE },
  { label: 'Waiting', value: JobStatus.WAITING },
  { label: 'Completed', value: JobStatus.COMPLETED },
  { label: 'Failed', value: JobStatus.FAILED },
  { label: 'Delayed', value: JobStatus.DELAYED },
]

const { data, refresh, pending, error } = await useFetch<{ jobs: JobDto[], total: number }>('/api/jobs', {
  query: {
    page,
    limit: pageCount,
    type: selectedStatus,
  },
  watch: [page, pageCount, selectedStatus],
})

const jobs = computed<JobDto[]>(() => data.value?.jobs || [])
const total = computed(() => data.value?.total || 0)

const autoRefresh = ref(true)
useIntervalFn(() => {
  if (autoRefresh.value && !pending.value) {
    refresh()
  }
}, 30_000)

const toast = useToast()
const isRetryModalOpen = ref(false)
const isDeleteModalOpen = ref(false)
const selectedJob = ref<JobDto | null>(null)

const isLogsOpen = ref(false)
const logsContainer = useTemplateRef('logs-container')

const selectedJobId = computed(() => selectedJob.value?.id || null)
const { logs: liveLogs } = useJobStream(selectedJobId)

watch(liveLogs, () => {
  nextTick(() => {
    if (logsContainer.value) {
      logsContainer.value.scrollTop = logsContainer.value.scrollHeight
    }
  })
}, { deep: true })

function openLogs(job: JobDto) {
  selectedJob.value = job
  isLogsOpen.value = true
}

function closeLogs() {
  isLogsOpen.value = false
  selectedJob.value = null
}

function openRetryModal(job: JobDto) {
  selectedJob.value = job
  isRetryModalOpen.value = true
}

function openDeleteModal(job: JobDto) {
  selectedJob.value = job
  isDeleteModalOpen.value = true
}

async function handleRetry() {
  if (!selectedJob.value) {
    return
  }

  try {
    await $fetch('/api/jobs/retry', {
      method: 'POST',
      body: {
        id: selectedJob.value.id,
      },
    })
    toast.add({ title: 'Job retried', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to retry job', description: err.data?.message || err.message, color: 'error' })
  } finally {
    isRetryModalOpen.value = false
    selectedJob.value = null
  }
}

async function handleDelete() {
  if (!selectedJob.value) {
    return
  }

  try {
    await $fetch('/api/jobs', {
      method: 'DELETE',
      query: {
        id: selectedJob.value.id,
      },
    })
    toast.add({ title: 'Job deleted', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to delete job', description: err.data?.message || err.message, color: 'error' })
  } finally {
    isDeleteModalOpen.value = false
    selectedJob.value = null
  }
}

definePageMeta({
  title: 'Job Management',
  middleware: [
    'auth',
  ],
})
</script>

<template>
  <div>
    <UCard data-testid="jobs-card">
      <template #header>
        <div class="flex justify-between items-center">
          <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">
            Background Jobs
          </h3>
          <div class="flex items-center gap-2">
            <USwitch
              v-model="autoRefresh"
              color="primary"
              label="Auto-refresh"
            />
            <UButton
              icon="i-heroicons-arrow-path"
              color="neutral"
              variant="ghost"
              :loading="pending"
              @click="() => refresh()"
            />
          </div>
        </div>
      </template>

      <div class="flex flex-col gap-4">
        <UAlert
          v-if="error"
          title="Error loading jobs"
          :description="error.message"
          color="error"
          variant="subtle"
          icon="i-heroicons-exclamation-triangle"
        />

        <div class="flex flex-wrap gap-4 items-center">
          <USelect
            v-model="selectedStatus"
            :items="statusOptions"
            placeholder="Filter by status"
            value-attribute="value"
            class="w-full sm:w-48"
          />
        </div>

        <div class="overflow-x-auto">
          <UTable
            :columns="columns"
            :data="jobs"
            :loading="pending"
            class="w-full"
          />
        </div>

        <div class="flex justify-end p-4 border-t border-gray-200 dark:border-gray-700">
          <UPagination
            v-model:page="page"
            :items-per-page="pageCount"
            :total="total"
          />
        </div>
      </div>
    </UCard>

    <USlideover
      v-model:open="isLogsOpen"
      title="Live Logs"
    >
      <template #content>
        <div class="flex flex-col h-full">
          <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h3 class="text-lg font-medium">
              Logs for Job #{{ selectedJob?.id }}
            </h3>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-heroicons-x-mark"
              @click="closeLogs"
            />
          </div>
          <div
            ref="logs-container"
            class="flex-1 overflow-y-auto p-4 bg-gray-950 text-gray-100 font-mono text-xs space-y-1"
          >
            <div
              v-if="liveLogs.length === 0"
              class="text-gray-500 italic"
            >
              Waiting for logs...
            </div>
            <div
              v-for="log in liveLogs"
              :key="log.timestamp"
              class="break-words"
            >
              <span class="text-gray-500">[{{ formatDate(log.timestamp) }}]</span>
              <span
                :class="{
                  'text-blue-400': log.level === 'info',
                  'text-yellow-400': log.level === 'warn',
                  'text-red-400': log.level === 'error',
                }"
                class="font-bold mx-2"
              >[{{ log.level.toUpperCase() }}]</span>
              <span>{{ log.message }}</span>
              <div
                v-if="log.meta && Object.keys(log.meta).length > 0"
                class="ml-8 text-gray-400 opacity-75"
              >
                {{ JSON.stringify(log.meta) }}
              </div>
            </div>
          </div>
        </div>
      </template>
    </USlideover>

    <UModal
      v-model:open="isRetryModalOpen"
      title="Confirm Retry"
    >
      <template #content>
        <div class="p-6 space-y-4">
          <p class="text-gray-500">
            Are you sure you want to retry job #{{ selectedJob?.id }}?
          </p>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              label="Cancel"
              color="neutral"
              variant="outline"
              @click="isRetryModalOpen = false"
            />
            <UButton
              label="Retry"
              color="warning"
              @click="handleRetry"
            />
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="isDeleteModalOpen"
      title="Confirm Delete"
    >
      <template #content>
        <div class="p-6 space-y-4">
          <p class="text-gray-500">
            Are you sure you want to delete job #{{ selectedJob?.id }}? This action cannot be undone.
          </p>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              label="Cancel"
              color="neutral"
              variant="outline"
              @click="isDeleteModalOpen = false"
            />
            <UButton
              label="Delete"
              color="error"
              @click="handleDelete"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
