export function getStatusColor(status: string) {
  switch (status) {
    case 'completed':
    case 'success':
      return 'success'
    case 'failed':
    case 'error':
      return 'error'
    case 'active':
      return 'primary'
    case 'waiting':
      return 'warning'
    case 'delayed':
      return 'neutral'
    default:
      return 'neutral'
  }
}
