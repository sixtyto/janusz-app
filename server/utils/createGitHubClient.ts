import { createAppAuth } from '@octokit/auth-app'
import { Octokit } from '@octokit/rest'

export function createGitHubClient(installationId: number) {
  const config = useRuntimeConfig()
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
          start_side: comment.start_line ? 'RIGHT' : undefined,
          side: 'RIGHT',
          body: comment.body,
        })
      }
      else {
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
    }
    catch (e) {
      console.error('Failed to post review:', e)
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
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    return data.id
  }

  async function updateCheckRun(
    owner: string,
    repo: string,
    checkRunId: number,
    conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required',
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
    await octokit.checks.update({
      owner,
      repo,
      check_run_id: checkRunId,
      status: 'completed',
      completed_at: new Date().toISOString(),
      conclusion,
      output,
    })
  }

  return {
    getPrDiff,
    getExistingReviewComments,
    postReview,
    postFallbackComment,
    createCheckRun,
    updateCheckRun,
  }
}
