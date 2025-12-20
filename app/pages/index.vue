<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

const { loggedIn, user, clear } = useUserSession()

const { data: stats, status: statsStatus, refresh: refreshStats } = await useFetch('/api/dashboard/stats', {
  immediate: loggedIn.value,
})

interface Job {
  id: string
  name: string
  status: 'completed' | 'failed' | 'active' | 'waiting' | 'delayed' | 'prioritized' | 'paused' | 'waiting-children' | 'unknown'
  timestamp: number
  result: any
  error: any
  processedOn: number
}

// Fetch Jobs
const { data: jobs, status: jobsStatus, refresh: refreshJobs } = await useFetch<Job[]>('/api/dashboard/jobs', {
  immediate: loggedIn.value,
})

const columns: TableColumn<Job>[] = [
  { accessorKey: 'id', header: 'Job ID' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'timestamp', header: 'Finished/Created' },
]

async function refreshAll() {
  await Promise.all([refreshStats(), refreshJobs()])
})

// Simple relative time formatter
function formatTime(ts: number) {
  if (!ts)
    return '-'
  return new Date(ts).toLocaleString()
}

</script>

<!-- Define useRefreshable composable inline or assume it's roughly equivalent to just a function wrapper -->
<template>
  <div class="p-4 max-w-7xl mx-auto space-y-6">
    <!-- Header -->
    <header
      class="flex justify-between items-center bg-white dark:bg-gray-900 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800"
    >
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          Janusz Dashboard
        </h1>
        <p
          v-if="loggedIn"
          class="text-gray-500 dark:text-gray-400 text-sm mt-1"
        >
          Welcome, {{ user?.name }}
        </p>
      </div>
      <div>
        <UButton
            to="/api/auth/github"
            icon="i-simple-icons-github"
            label="Login with GitHub"
            color="neutral"
            external
        />
        </div>
        <div
          v-else
          class="flex gap-2"
        >
          <UButton
            to="/jobs"
            icon="i-heroicons-queue-list"
            color="neutral"
            variant="ghost"
          >
            Jobs
          </UButton>
          <UButton
            to="/logs"
            icon="i-heroicons-document-text"
            color="neutral"
            variant="ghost"
          >
            Logs
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-heroicons-arrow-right-start-on-rectangle-20-solid"
            label="Logout"
            @click="clear"
          />
        </div>
      </div>
    </header>

    <div
      v-if="loggedIn"
      class="space-y-6"
    >
      <!-- Queue Stats -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <UCard
          v-for="(count, key) in stats"
          :key="key"
        >
          <dt class="text-base font-normal text-gray-500 dark:text-gray-400 capitalize">
            {{ key }}
          </dt>
          <dd class="mt-1 flex items-baseline justify-between md:block lg:flex">
            <div class="flex items-baseline text-2xl font-semibold text-gray-900 dark:text-white">
              <USkeleton
                v-if="statsStatus === 'pending'"
                class="h-8 w-16"
              />
              <span v-else>{{ count }}</span>
            </div>
          </dd>
        </UCard>
      </div>

      <!-- Recent Jobs -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">
              Recent Jobs
            </h3>
            <UButton
              icon="i-heroicons-arrow-path"
              variant="ghost"
              color="neutral"
              :loading="jobsStatus === 'pending' || statsStatus === 'pending'"
              @click="refreshAll"
            />
          </div>
        </template>

        <UTable
          :data="jobs || []"
          :columns="columns"
          :loading="jobsStatus === 'pending'"
        >
          <template #status-cell="{ row }">
            <UBadge
              :color="getStatusColor(row.original.status) as any"
              variant="subtle"
            >
              {{ row.original.status }}
            </UBadge>
          </template>

          <template #timestamp-cell="{ row }">
            {{ formatTime(row.original.timestamp) }}
          </template>
        </UTable>

        <div
          v-if="jobsStatus !== 'pending' && jobs?.length === 0"
          class="text-center py-6 text-gray-500"
        >
          No recent jobs found for this installation.
        </div>
      </UCard>
    </div>

    <div
      v-else
      class="text-center py-20"
    >
      <div class="text-gray-500">
        Please login to view dashboard.
      </div>
    </div>
  </div>
</template>
