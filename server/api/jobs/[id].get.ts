import type { JobDto } from '#shared/types/JobDto'
import type { JobStatus } from '#shared/types/JobStatus'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { jobs } from '~~/server/database/schema'
import { getUserInstallationIds } from '~~/server/utils/getUserInstallationIds'
import { useDatabase } from '~~/server/utils/useDatabase'

const paramsSchema = z.object({
  id: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const githubToken = session.secure?.githubToken
  if (!githubToken) {
    throw createError({ status: 401, message: 'Missing GitHub token' })
  }

  const { id } = await getValidatedRouterParams(event, params => paramsSchema.parse(params))

  const installationIds = await getUserInstallationIds(githubToken)

  if (!installationIds || installationIds.size === 0) {
    throw createError({ status: 403, message: 'No accessible installations' })
  }

  const database = useDatabase()
  const record = await database.query.jobs.findFirst({
    where: eq(jobs.id, id),
  })

  if (!record) {
    throw createError({ status: 404, message: 'Job not found' })
  }

  if (!installationIds.has(record.installationId)) {
    throw createError({ status: 403, message: 'Access denied' })
  }

  const job: JobDto = {
    id: record.id,
    name: 'review-job',
    data: {
      repositoryFullName: record.repositoryFullName,
      installationId: record.installationId,
      prNumber: record.pullRequestNumber,
    },
    attemptsMade: record.attempts,
    failedReason: record.failedReason ?? undefined,
    processedAt: record.processedAt?.toISOString(),
    finishedAt: record.finishedAt?.toISOString(),
    state: record.status as JobStatus,
    progress: 0,
    timestamp: record.createdAt.toISOString(),
    executionHistory: record.executionHistory ?? undefined,
  }

  return job
})
