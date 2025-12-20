export function formatDate(date: string | number | Date): string {
  if (!date) {
    return '-'
  }
  return new Date(date).toLocaleString()
}
