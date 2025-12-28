export enum CheckRunStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  QUEUED = 'queued',
}

export enum CheckRunConclusion {
  SUCCESS = 'success',
  FAILURE = 'failure',
  NEUTRAL = 'neutral',
  CANCELLED = 'cancelled',
  SKIPPED = 'skipped',
  TIMED_OUT = 'timed_out',
  ACTION_REQUIRED = 'action_required',
}
