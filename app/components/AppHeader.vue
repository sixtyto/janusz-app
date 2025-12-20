<script setup lang="ts">
const { title } = usePageHeader()
const { loggedIn, clear } = useUserSession()
</script>

<template>
  <header
    class="flex justify-between items-center bg-white dark:bg-gray-900 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800"
  >
    <div>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        {{ title }}
      </h1>
      <slot name="description" />
    </div>

    <div>
      <div
        v-if="!loggedIn"
        class="flex gap-2"
      >
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
        <slot name="actions-auth" />

        <UButton
          to="/"
          icon="i-heroicons-home"
          color="neutral"
          variant="ghost"
          label="Dashboard"
        />
        <UButton
          to="/jobs"
          icon="i-heroicons-queue-list"
          color="neutral"
          variant="ghost"
          label="Jobs"
        />
        <UButton
          to="/logs"
          icon="i-heroicons-document-text"
          color="neutral"
          variant="ghost"
          label="Logs"
        />
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
</template>
