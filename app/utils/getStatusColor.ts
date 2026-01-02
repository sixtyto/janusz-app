import { CheckRunConclusion } from '#shared/types/CheckRunStatus'
import { JobStatus } from '#shared/types/JobStatus'

const statusColorMap: Record<string, string> = {
  [JobStatus.COMPLETED]: 'success',
  [JobStatus.ACTIVE]: 'primary',
  [JobStatus.WAITING]: 'warning',
  [JobStatus.FAILED]: 'error',
  [CheckRunConclusion.SUCCESS]: 'success',
  [CheckRunConclusion.FAILURE]: 'error',
  [CheckRunConclusion.NEUTRAL]: 'neutral',
}

export function getStatusColor(status: string) {
  return statusColorMap[status] ?? 'neutral'
}
