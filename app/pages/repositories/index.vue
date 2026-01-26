<script setup lang="ts">
const { loggedIn } = useUserSession()

const { data: repositories, status, refresh } = await useFetch('/api/repositories', {
  immediate: loggedIn.value,
})

watch(loggedIn, (isLoggedIn) => {
  if (isLoggedIn) {
    refresh()
  }
})

definePageMeta({
  title: 'Repositories',
  middleware: ['auth'],
})
</script>

<template>
  <div>
    <div
      v-if="loggedIn"
      class="space-y-6"
    >
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            Repositories
          </h1>
          <p class="text-gray-500 dark:text-gray-400 mt-1">
            Configure settings for your repositories
          </p>
        </div>

        <UButton
          icon="i-heroicons-arrow-path"
          label="Refresh"
          color="neutral"
          variant="outline"
          :loading="status === 'pending'"
          @click="() => refresh()"
        />
      </div>

      <div
        v-if="status === 'pending'"
        class="space-y-4"
      >
        <USkeleton class="h-20 w-full" />
        <USkeleton class="h-20 w-full" />
        <USkeleton class="h-20 w-full" />
      </div>

      <UAlert
        v-else-if="status === 'error'"
        title="Error loading repositories"
        description="Failed to load repositories. Please try again."
        color="error"
        variant="subtle"
        icon="i-heroicons-exclamation-triangle"
      />

      <UAlert
        v-else-if="!repositories || repositories.length === 0"
        title="No repositories found"
        description="Install the Janusz GitHub App to any repository to see it here."
        color="neutral"
        variant="subtle"
        icon="i-heroicons-information-circle"
      />

      <div
        v-else
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        <UCard
          v-for="repository in repositories"
          :key="repository.id"
          class="hover:shadow-md transition-shadow"
        >
          <template #header>
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-2">
                <UIcon
                  name="i-simple-icons-github"
                  class="text-gray-500 dark:text-gray-400"
                />
                <h3 class="font-semibold text-gray-900 dark:text-white truncate">
                  {{ repository.name }}
                </h3>
              </div>
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {{ repository.full_name }}
            </p>
          </template>

          <div class="space-y-2">
            <div
              v-if="repository.description"
              class="text-sm text-gray-600 dark:text-gray-300"
            >
              {{ repository.description }}
            </div>

            <div class="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
              <span
                v-if="repository.language"
                class="flex items-center gap-1"
              >
                <span class="w-2 h-2 rounded-full bg-blue-500" />
                {{ repository.language }}
              </span>
              <span
                v-if="repository.private"
                class="flex items-center gap-1"
              >
                <UIcon
                  name="i-heroicons-lock-closed"
                  class="w-4 h-4"
                />
                Private
              </span>
            </div>
          </div>

          <template #footer>
            <NuxtLink
              :to="`/repositories/${repository.full_name}/settings`"
              class="block w-full"
            >
              <UButton
                color="neutral"
                variant="outline"
                label="Configure Settings"
                block
                class="w-full"
              />
            </NuxtLink>
          </template>
        </UCard>
      </div>
    </div>

    <div
      v-else
      class="text-center py-20"
    >
      <div class="text-gray-500">
        Please login to view repositories.
      </div>
    </div>
  </div>
</template>
