import type { LogEntry } from '#shared/types/LogEntry'
import { useEventSource } from '@vueuse/core'

export function useJobStream(jobId: MaybeRefOrGetter<string | null | undefined>) {
  const logs = ref<LogEntry[]>([])

  const url = computed(() => {
    const id = toValue(jobId)
    if (!id) {
      return null
    }
    return withQuery('/api/jobs/stream', { id })
  })

  const { data, status, error, close } = useEventSource(url)

  watch(data, (newMsg) => {
    if (newMsg) {
      try {
        const log = JSON.parse(newMsg) as LogEntry
        logs.value.push(log)
      } catch (e) {
        console.error('Failed to parse log entry', e)
      }
    }
  })

  watch(url, () => {
    logs.value = []
  })

  return {
    logs,
    status,
    error,
    close,
  }
}
