export function formatDate(date: string | number | Date | undefined | null): string {
  if (!date) {
    return '-'
  }
  return new Date(date).toLocaleString()
}
