<script setup lang="ts">
const route = useRoute()
const { title } = usePageHeader()
const { loggedIn, clear } = useUserSession()

const navLinks = [
  { to: '/', icon: 'i-heroicons-home', label: 'Dashboard' },
  { to: '/jobs', icon: 'i-heroicons-queue-list', label: 'Jobs' },
  { to: '/logs', icon: 'i-heroicons-document-text', label: 'Logs' },
]

function isActive(to: string) {
  if (to === '/') {
    return route.path === '/'
  }
  return route.path === to || route.path.startsWith(`${to}/`)
}

async function logout() {
  await clear()
  await navigateTo('/')
}
</script>

<template>
  <header
    class="flex justify-between items-center bg-white dark:bg-gray-900 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800"
  >
    <div>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        {{ title }}
      </h1>
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

      <nav
        v-else
        class="flex gap-2"
      >
        <UButton
          v-for="link in navLinks"
          :key="link.to"
          :active="isActive(link.to)"
          active-color="primary"
          active-variant="subtle"
          :to="link.to"
          :icon="link.icon"
          :label="link.label"
          color="neutral"
          variant="link"
        />
        <UButton
          color="neutral"
          variant="link"
          icon="i-heroicons-arrow-right-start-on-rectangle-20-solid"
          label="Logout"
          @click="logout"
        />
      </nav>
    </div>
  </header>
</template>
