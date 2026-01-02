export function formatDate(date: string | number | Date | undefined | null) {
  if (!date) {
    return '-'
  }
  return new Date(date).toLocaleString()
}
