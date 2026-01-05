import { JobStatus } from '#shared/types/JobStatus'
import { z } from 'zod'
import { getUserInstallationIds } from '~~/server/utils/getUserInstallationIds'

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  type: z.nativeEnum(JobStatus).optional(),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const githubToken = session.secure?.githubToken
  if (!githubToken) {
    throw createError({ status: 401, message: 'Missing GitHub token' })
  }

  const query = await getValidatedQuery(event, q => querySchema.parse(q))

  const installationIds = await getUserInstallationIds(githubToken)

  const start = (query.page - 1) * query.limit
  const end = start + query.limit - 1

  let types: JobStatus[] | undefined
  if (query.type) {
    types = [query.type]
  }

  const result = await jobService.getJobs({
    type: types,
    start,
    end,
    installationIds,
  })

  return {
    jobs: result.jobs,
    total: result.total,
    page: query.page,
    limit: query.limit,
  }
})
