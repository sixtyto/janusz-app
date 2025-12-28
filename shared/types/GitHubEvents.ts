export enum GitHubEvent {
  PULL_REQUEST = 'pull_request',
  PULL_REQUEST_REVIEW_COMMENT = 'pull_request_review_comment',
}

export enum GitHubAction {
  OPENED = 'opened',
  SYNCHRONIZE = 'synchronize',
  CREATED = 'created',
}

export enum GitHubUserType {
  BOT = 'Bot',
}
