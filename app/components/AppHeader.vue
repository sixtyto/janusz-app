<script setup lang="ts">
const route = useRoute()
const { loggedIn, clear } = useUserSession()
const isMenuOpen = ref(false)
const { isAdmin } = useAdminAccess()

const title = computed(() => route.meta.title as string || 'Dashboard')

useHead({
  title: () => title.value,
  titleTemplate: chunk => `${chunk} - Janusz`,
})

const allNavLinks = [
  { to: '/', icon: 'i-heroicons-home', label: 'Dashboard' },
  { to: '/jobs', icon: 'i-heroicons-queue-list', label: 'Jobs' },
  { to: '/admin/queue', icon: 'i-heroicons-cog-6-tooth', label: 'Queue Admin', adminOnly: true },
  { to: '/logs', icon: 'i-heroicons-document-text', label: 'Logs' },
]

const navLinks = computed(() =>
  allNavLinks.filter(link => !link.adminOnly || isAdmin.value),
)

async function logout() {
  await clear()
  await navigateTo('/')
}

watch(() => route.path, () => {
  isMenuOpen.value = false
})
</script>

<template>
  <header
    class="flex justify-between items-center bg-white dark:bg-gray-900 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800"
  >
    <div class="flex items-center gap-3">
      <UButton
        v-if="loggedIn"
        icon="i-heroicons-bars-3"
        color="neutral"
        variant="ghost"
        class="md:hidden"
        @click="isMenuOpen = true"
      />
      <h1
        class="text-xl md:text-2xl font-bold text-gray-900 dark:text-white truncate"
        data-testid="page-title"
      >
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
          label="Login"
          color="neutral"
          data-testid="login-button"
          external
        />
      </div>

      <nav
        v-else
        class="hidden md:flex gap-2"
      >
        <UButton
          v-for="link in navLinks"
          :key="link.to"
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

    <!-- Mobile Navigation -->
    <USlideover
      v-model:open="isMenuOpen"
      title="Janusz Menu"
    >
      <template #body>
        <div class="flex flex-col gap-2">
          <UButton
            v-for="link in navLinks"
            :key="link.to"
            active-color="primary"
            active-variant="subtle"
            :to="link.to"
            :icon="link.icon"
            :label="link.label"
            color="neutral"
            variant="ghost"
            class="justify-start w-full"
          />
          <USeparator class="my-2" />
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-heroicons-arrow-right-start-on-rectangle-20-solid"
            label="Logout"
            class="justify-start w-full"
            @click="logout"
          />
        </div>
      </template>
    </USlideover>
  </header>
</template>
