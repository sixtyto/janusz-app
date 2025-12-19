<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

// Define a simplified Job interface for the frontend to avoid deep BullMQ type issues
interface JobRow {
  id: string
  name: string
  data: PrReviewJobData
  status: string
  attemptsMade: number
  failedReason?: string
  finishedOn?: number
  processedOn?: number
  returnvalue?: any
  state?: string
}

const columns: TableColumn<JobRow>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Job Name' },
  { accessorKey: 'repositoryFullName', header: 'Repo' },
  { accessorKey: 'data.prNumber', header: 'PR #' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'attemptsMade', header: 'Attempts' },
  { accessorKey: 'actions', header: 'Actions' },
]

const page = ref(1)
const pageCount = ref(20)
const selectedStatus = ref<string | undefined>(undefined)
const statusOptions = [
  { label: 'All', value: undefined },
  { label: 'Active', value: 'active' },
  { label: 'Waiting', value: 'waiting' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
  { label: 'Delayed', value: 'delayed' },
]

const { data, refresh, pending } = await useFetch<{ jobs: JobRow[], total: number }>('/api/jobs', {
  query: {
    page,
    limit: pageCount,
    type: selectedStatus,
  },
  watch: [page, pageCount, selectedStatus],
})

const jobs = computed(() => data.value?.jobs || [])
const total = computed(() => data.value?.total || 0)

// User session for header
const { user, clear } = useUserSession()

// Actions
const toast = useToast()
const isRetryModalOpen = ref(false)
const isDeleteModalOpen = ref(false)
const selectedJob = ref<JobRow | null>(null)

function openRetryModal(job: any) {
  selectedJob.value = job
  isRetryModalOpen.value = true
}

function openDeleteModal(job: any) {
  selectedJob.value = job
  isDeleteModalOpen.value = true
}

async function handleRetry() {
  if (!selectedJob.value)
    return

  try {
    await $fetch(`/api/jobs/${encodeURIComponent(selectedJob.value.id)}/retry`, {
      method: 'POST',
    })
    toast.add({ title: 'Job retried', color: 'success' })
    refresh()
  }
  catch (err: any) {
    toast.add({ title: 'Failed to retry job', description: err.data?.message || err.message, color: 'error' })
  }
  finally {
    isRetryModalOpen.value = false
    selectedJob.value = null
  }
}

async function handleDelete() {
  if (!selectedJob.value)
    return

  try {
    await $fetch(`/api/jobs/${encodeURIComponent(selectedJob.value.id)}`, {
      method: 'DELETE',
    })
    toast.add({ title: 'Job deleted', color: 'success' })
    refresh()
  }
  catch (err: any) {
    toast.add({ title: 'Failed to delete job', description: err.data?.message || err.message, color: 'error' })
  }
  finally {
    isDeleteModalOpen.value = false
    selectedJob.value = null
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'active': return 'primary'
    case 'completed': return 'success'
    case 'failed': return 'error'
    case 'waiting': return 'warning'
    case 'delayed': return 'neutral'
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
  <div class="p-4 max-w-7xl mx-auto space-y-6">
    <header
      class="flex justify-between items-center bg-white dark:bg-gray-900 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800"
    >
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          Job Management
        </h1>
        <p class="text-gray-500 dark:text-gray-400 text-sm mt-1">
          Manage background jobs for {{ user?.name }}
        </p>
      </div>
      <div class="flex gap-2">
        <UButton to="/" icon="i-heroicons-home" color="neutral" variant="ghost">
          Dashboard
        </UButton>
        <UButton to="/logs" icon="i-heroicons-document-text" color="neutral" variant="ghost">
          Logs
        </UButton>
        <UButton
          color="neutral" variant="ghost" icon="i-heroicons-arrow-right-start-on-rectangle-20-solid"
          label="Logout" @click="clear"
        />
      </div>
    </header>

    <UCard>
      <template #header>
        <div class="flex justify-between items-center">
          <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">
            Background Jobs
          </h3>
          <UButton
            icon="i-heroicons-arrow-path" color="neutral" variant="ghost" :loading="pending"
            @click="() => refresh()"
          />
        </div>
      </template>

      <div class="flex gap-4 items-center">
        <USelectMenu
          v-model="selectedStatus" :options="statusOptions" placeholder="Filter by status"
          value-attribute="value"
        />
      </div>

      <UTable :data="jobs" :columns="columns" :loading="pending">
        <template #status-cell="{ row }">
          <UBadge
            :color="getStatusColor((row.original as any).returnvalue?.status || (row.original as any).state || 'unknown')"
            variant="subtle"
          >
            {{ (row.original as any).state || 'unknown' }}
          </UBadge>
        </template>

        <template #repositoryFullName-cell="{ row }">
          {{ (row.original as any).data?.repositoryFullName || '-' }}
        </template>

        <template #actions-cell="{ row }">
          <div class="flex gap-2">
            <UButton
              v-if="(row.original as any).failedReason || (row.original as any).state === 'failed'" size="xs"
              color="warning" variant="ghost" icon="i-heroicons-arrow-path" @click="openRetryModal(row.original)"
            >
              Retry
            </UButton>
            <UButton
              size="xs" color="error" variant="ghost" icon="i-heroicons-trash"
              @click="openDeleteModal(row.original)"
            >
              Delete
            </UButton>
          </div>
        </template>
      </UTable>

      <div class="flex justify-end p-4 border-t border-gray-200 dark:border-gray-700">
        <UPagination v-model="page" :page-count="pageCount" :total="total" />
      </div>
    </UCard>

    <UModal v-model:open="isRetryModalOpen" title="Confirm Retry" :ui="{ footer: 'justify-end' }">
      <template #body>
        <p>Are you sure you want to retry job #{{ selectedJob?.id }}?</p>
      </template>
      <template #footer="{ close }">
        <UButton label="Cancel" color="neutral" variant="outline" @click="close" />
        <UButton label="Retry" color="warning" @click="handleRetry" />
      </template>
    </UModal>

    <UModal v-model:open="isDeleteModalOpen" title="Confirm Delete" :ui="{ footer: 'justify-end' }">
      <template #body>
        <p>Are you sure you want to delete job #{{ selectedJob?.id }}? This action cannot be undone.</p>
      </template>
      <template #footer="{ close }">
        <UButton label="Cancel" color="neutral" variant="outline" @click="close" />
        <UButton label="Delete" color="error" @click="handleDelete" />
      </template>
    </UModal>
  </div>
</template>
