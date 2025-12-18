<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { LogEntry } from '~~/server/api/logs.get'

definePageMeta({
  middleware: 'auth',
})

const columns: TableColumn<LogEntry>[] = [
  { accessorKey: 'timestamp', header: 'Time' },
  { accessorKey: 'level', header: 'Level' },
  { accessorKey: 'service', header: 'Service' },
  { accessorKey: 'message', header: 'Message' },
]

const levelOptions = ['info', 'warn', 'error']
const serviceOptions = ['worker', 'webhook']

const selectedLevel = ref<string | undefined>(undefined)
const selectedService = ref<string | undefined>(undefined)
const autoRefresh = ref(false)

const { data: logs, refresh, pending } = await useFetch<LogEntry[]>('/api/logs', {
  lazy: true,
})

// Client-side filtering
const filteredLogs = computed(() => {
  if (!logs.value)
    return []
  return logs.value.filter((log) => {
    if (selectedLevel.value && log.level !== selectedLevel.value)
      return false
    if (selectedService.value && log.service !== selectedService.value)
      return false
    return true
  })
})

// Auto-refresh logic
let interval: NodeJS.Timeout | null = null

watch(autoRefresh, (newValue) => {
  if (newValue) {
    interval = setInterval(() => refresh(), 5000)
  }
  else if (interval) {
    clearInterval(interval)
    interval = null
  }
})

onBeforeUnmount(() => {
  if (interval)
    clearInterval(interval)
})

function getLevelBadgeColor(level: string) {
  switch (level) {
    case 'info': return 'neutral'
    case 'warn': return 'warning'
    case 'error': return 'error'
    default: return 'neutral'
  }
}
</script>

<template>
  <div class="p-4 space-y-4">
    <div class="flex justify-between items-center">
      <h2 class="text-xl font-bold">
        Logs
      </h2>
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-2 mr-4">
          <span class="text-sm text-gray-500">Auto-refresh</span>
          <UToggle v-model="autoRefresh" />
        </div>
        <UButton
          icon="i-heroicons-arrow-path"
          color="neutral"
          variant="ghost"
          :loading="pending"
          @click="refresh()"
        />
      </div>
    </div>

    <div class="flex gap-2 mb-4">
      <USelectMenu
        v-model="selectedLevel"
        :options="levelOptions"
        placeholder="Filter by Level"
        clearable
        class="w-40"
      />
      <USelectMenu
        v-model="selectedService"
        :options="serviceOptions"
        placeholder="Filter by Service"
        clearable
        class="w-40"
      />
    </div>

    <UTable :data="filteredLogs" :columns="columns" :loading="pending">
      <template #timestamp-cell="{ row }">
        {{ new Date(row.original.timestamp).toLocaleTimeString() }}
      </template>

      <template #level-cell="{ row }">
        <UBadge :color="getLevelBadgeColor(row.original.level)" variant="subtle" size="xs">
          {{ row.original.level.toUpperCase() }}
        </UBadge>
      </template>
    </UTable>
  </div>
</template>
