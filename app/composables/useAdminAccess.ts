export function useAdminAccess() {
  const isAdmin = ref(false)
  const isLoading = ref(true)
  const error = ref<string | null>(null)

  async function checkAdminAccess() {
    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch<{ isAdmin: boolean }>('/api/admin/check')
      isAdmin.value = response.isAdmin
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to check admin access'
      isAdmin.value = false
    } finally {
      isLoading.value = false
    }
  }

  onMounted(() => {
    checkAdminAccess()
  })

  return {
    isAdmin,
    isLoading,
    error,
    checkAdminAccess,
  }
}
