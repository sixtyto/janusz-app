import type { CheckRunConclusion } from '#shared/types/CheckRunStatus'
import type { RestEndpointMethodTypes } from '@octokit/rest'
import { CheckRunStatus } from '#shared/types/CheckRunStatus'
import { ServiceType } from '#shared/types/ServiceType'
import { createAppAuth } from '@octokit/auth-app'
import { Octokit } from '@octokit/rest'

export function createGitHubClient(installationId: number) {
  const config = useRuntimeConfig()
  const logger = createLogger(ServiceType.api)
  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.githubAppId,
      privateKey: config.githubPrivateKey,
      installationId,
    },
  })

  async function getPrDiff(owner: string, repo: string, prNumber: number): Promise<FileDiff[]> {
    const iterator = octokit.paginate.iterator(octokit.pulls.listFiles, {
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    })

    const fileDiffs: FileDiff[] = []

    for await (const { data: files } of iterator) {
      for (const file of files) {
        if (
          file.status === 'removed'
          || file.filename.endsWith('.lock')
          || file.filename.includes('dist/')
          || file.filename.includes('build/')
          || file.filename.includes('node_modules/')
          || (file.patch?.length ?? 0) > 100000
        ) {
          continue
        }

        if (file.patch) {
          fileDiffs.push({
            filename: file.filename,
            patch: file.patch,
            status: file.status,
          })
        }
      }
    }

    return fileDiffs
  }

  async function getExistingReviewComments(owner: string, repo: string, prNumber: number): Promise<Set<string>> {
    const comments = await octokit.paginate(octokit.pulls.listReviewComments, {
      owner,
      repo,
      pull_number: prNumber,
    })

    const signatures = new Set<string>()
    for (const comment of comments) {
      if (comment.path && comment.line && comment.body) {
        const signature = `${comment.path}:${comment.line}:${comment.body.trim()}`
        signatures.add(signature)
      }
    }
    return signatures
  }

  async function postReview(
    owner: string,
    repo: string,
    prNumber: number,
    headSha: string,
    summary: string,
    comments: ReviewComment[],
  ) {
    const validComments: {
      path: string
      position?: number
      body: string
      line?: number
      side?: string
      start_line?: number
      start_side?: string
    }[] = []
    const failedComments: string[] = []

    for (const comment of comments) {
      if (comment.line) {
        validComments.push({
          path: comment.filename,
          line: comment.line,
          start_line: comment.start_line,
          start_side: comment.start_line ? comment.side : undefined,
          side: comment.side ?? 'RIGHT',
          body: comment.body,
        })
      } else {
        failedComments.push(`- **${comment.filename}**: ${comment.body} (Snippet not found in diff context)`)
      }
    }

    if (validComments.length === 0 && !summary && failedComments.length === 0) {
      return
    }

    let finalBody = summary
    if (failedComments.length > 0) {
      finalBody += `\n\n### ⚠️ General Comments (Context missing)\n${failedComments.join('\n')}`
    }

    const safeComments = validComments.slice(0, 40)

    try {
      await octokit.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        commit_id: headSha,
        body: finalBody,
        event: 'COMMENT',
        comments: safeComments,
      })
    } catch (e) {
      logger.error('Failed to post review:', { error: e, owner, repo, prNumber })
      await postFallbackComment(owner, repo, prNumber, `## Automated Review Failed to Post Inline\n\n${finalBody}`)
    }
  }

  async function postFallbackComment(owner: string, repo: string, prNumber: number, message: string) {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: message,
    })
  }

  async function createCheckRun(owner: string, repo: string, headSha: string) {
    const { data } = await octokit.checks.create({
      owner,
      repo,
      name: 'Janusz Review',
      head_sha: headSha,
      status: CheckRunStatus.IN_PROGRESS,
      started_at: new Date().toISOString(),
    })
    return data.id
  }

  async function updateCheckRun(
    owner: string,
    repo: string,
    checkRunId: number,
    conclusion: CheckRunConclusion,
    output?: {
      title: string
      summary: string
      annotations?: {
        path: string
        start_line: number
        end_line: number
        annotation_level: 'notice' | 'warning' | 'failure'
        message: string
        title?: string
      }[]
    },
  ) {
    const annotations = output?.annotations || []

    if (annotations.length <= 50) {
      await octokit.checks.update({
        owner,
        repo,
        check_run_id: checkRunId,
        status: CheckRunStatus.COMPLETED,
        completed_at: new Date().toISOString(),
        conclusion,
        output,
      })
      return
    }

    const batchSize = 50
    const batches = []
    for (let i = 0; i < annotations.length; i += batchSize) {
      batches.push(annotations.slice(i, i + batchSize))
    }

    for (let i = 0; i < batches.length; i++) {
      const isLastBatch = i === batches.length - 1
      const batchAnnotations = batches[i]

      const updateParams: RestEndpointMethodTypes['checks']['update']['parameters'] = {
        owner,
        repo,
        check_run_id: checkRunId,
        output: {
          title: output!.title,
          summary: output!.summary,
          annotations: batchAnnotations,
        },
      }

      if (isLastBatch) {
        updateParams.status = CheckRunStatus.COMPLETED
        updateParams.completed_at = new Date().toISOString()
        updateParams.conclusion = conclusion
      }

      await octokit.checks.update(updateParams)
    }
  }

  async function getToken() {
    const auth = await octokit.auth({ type: 'installation', installationId }) as { token: string }
    return auth.token
  }

  async function getReviewComment(owner: string, repo: string, commentId: number) {
    const { data } = await octokit.pulls.getReviewComment({
      owner,
      repo,
      comment_id: commentId,
    })
    return data
  }

  async function listReviewCommentsForPr(owner: string, repo: string, prNumber: number) {
    return await octokit.paginate(octokit.pulls.listReviewComments, {
      owner,
      repo,
      pull_number: prNumber,
    })
  }

  async function createReplyForReviewComment(owner: string, repo: string, pullNumber: number, commentId: number, body: string) {
    const { data } = await octokit.pulls.createReplyForReviewComment({
      owner,
      repo,
      pull_number: pullNumber,
      comment_id: commentId,
      body,
    })
    return data
  }

  async function createReactionForReviewComment(owner: string, repo: string, commentId: number, content: 'eyes' | '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket') {
    const { data } = await octokit.reactions.createForPullRequestReviewComment({
      owner,
      repo,
      comment_id: commentId,
      content,
    })
    return data
  }

  async function getPullRequest(owner: string, repo: string, pullNumber: number) {
    const { data } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    })
    return data
  }

  async function updatePullRequest(owner: string, repo: string, pullNumber: number, body: string) {
    const { data } = await octokit.pulls.update({
      owner,
      repo,
      pull_number: pullNumber,
      body,
    })
    return data
  }

  async function getBotUser() {
    const { data } = await octokit.apps.getAuthenticated()
    return data
  }

  return {
    getPrDiff,
    getExistingReviewComments,
    postReview,
    postFallbackComment,
    createCheckRun,
    updateCheckRun,
    getToken,
    getReviewComment,
    listReviewCommentsForPr,
    createReplyForReviewComment,
    createReactionForReviewComment,
    getBotUser,
    getPullRequest,
    updatePullRequest,
  }
}
