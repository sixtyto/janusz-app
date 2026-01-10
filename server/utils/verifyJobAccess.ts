import type { UserSession } from '#auth-utils'
import type { PrReviewJobData } from '#shared/types/PrReviewJobData'
import type { Job } from 'bullmq'
import { getUserInstallationIds } from '~~/server/utils/getUserInstallationIds'
import { jobService } from '~~/server/utils/jobService'

export async function verifyJobAccess(
  jobId: string,
  session: UserSession,
): Promise<Job<PrReviewJobData>> {
  const job = await jobService.getJob(jobId)

  if (!job) {
    throw createError({
      status: 404,
      message: 'Job not found',
    })
  }

  const jobData = job.data as PrReviewJobData | undefined
  const installationId = jobData?.installationId

  if (installationId === undefined) {
    throw createError({
      status: 500,
      message: 'Invalid job data: missing installation info',
    })
  }

  const githubToken = session.secure?.githubToken
  if (!githubToken) {
    throw createError({
      status: 401,
      message: 'Missing GitHub token',
    })
  }

  const userInstallationIds = await getUserInstallationIds(githubToken)

  if (!userInstallationIds.has(installationId)) {
    throw createError({
      status: 403,
      message: 'You do not have access to this job',
    })
  }

  return job as Job<PrReviewJobData>
}
