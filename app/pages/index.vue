<script setup lang="ts">
const { loggedIn } = useUserSession()

const { data: stats, status: statsStatus, refresh: refreshStats } = await useFetch('/api/dashboard/stats', {
  immediate: loggedIn.value,
})

watch(loggedIn, (isLoggedIn) => {
  if (isLoggedIn) {
    refreshStats()
  }
})

definePageMeta({
  title: 'Dashboard',
})
</script>

<template>
  <div>
    <div
      v-if="loggedIn"
      class="space-y-6"
    >
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
