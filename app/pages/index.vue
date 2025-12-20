<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

const { loggedIn } = useUserSession()

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

const { data: jobs, status: jobsStatus, refresh: refreshJobs } = await useFetch<Job[]>('/api/dashboard/jobs', {
  immediate: loggedIn.value,
})

const columns: TableColumn<Job>[] = [
  { accessorKey: 'id', header: 'Job ID' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'timestamp', header: 'Finished/Created' },
]

const { setHeader } = usePageHeader()

watchEffect(() => {
  setHeader('Janusz Dashboard')
})

async function refreshAll() {
  await Promise.all([refreshStats(), refreshJobs()])
}

watch(loggedIn, (isLoggedIn) => {
  if (isLoggedIn) {
    refreshAll()
  }
})
</script>

<template>
  <div>
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
              :color="getStatusColor(row.original.status)"
              variant="subtle"
            >
              {{ row.original.status }}
            </UBadge>
          </template>

          <template #timestamp-cell="{ row }">
            <ClientOnly>
              {{ formatDate(row.original.timestamp) }}
            </ClientOnly>
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
