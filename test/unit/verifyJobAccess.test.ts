import type { UserSession } from '#auth-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getUserInstallationIds } from '~~/server/utils/getUserInstallationIds'
import { verifyJobAccess } from '~~/server/utils/verifyJobAccess'

vi.stubGlobal('createError', (options: { statusCode: number, message: string }) => {
  const error = new Error(options.message) as Error & { statusCode: number }
  error.statusCode = options.statusCode
  return error
})

const mockGetJob = vi.fn()
vi.stubGlobal('jobService', {
  getJob: mockGetJob,
})

vi.mock('~~/server/utils/getUserInstallationIds', () => ({
  getUserInstallationIds: vi.fn(),
}))

const mockGetUserInstallationIds = getUserInstallationIds as ReturnType<typeof vi.fn>

describe('verifyJobAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // eslint-disable-next-line ts/no-unsafe-assignment
  const validSession = {
    user: { login: 'testuser' },
    secure: { githubToken: 'valid-token' },
  } as UserSession

  const validJob = {
    id: 'job-123',
    data: { installationId: 456, repository: 'owner/repo', pullRequestNumber: 1 },
  }

  it('should return job when user has access', async () => {
    mockGetJob.mockResolvedValue(validJob)
    mockGetUserInstallationIds.mockResolvedValue(new Set([456, 789]))

    const result = await verifyJobAccess('job-123', validSession)

    expect(result).toBe(validJob)
    expect(mockGetJob).toHaveBeenCalledWith('job-123')
    expect(mockGetUserInstallationIds).toHaveBeenCalledWith('valid-token')
  })

  it('should throw 404 when job is not found', async () => {
    mockGetJob.mockResolvedValue(null)

    await expect(verifyJobAccess('nonexistent-job', validSession))
      .rejects
      .toMatchObject({
        statusCode: 404,
        message: 'Job not found',
      })
  })

  it('should throw 500 when job data is missing installationId', async () => {
    mockGetJob.mockResolvedValue({
      id: 'job-123',
      data: { repository: 'owner/repo' },
    })

    await expect(verifyJobAccess('job-123', validSession))
      .rejects
      .toMatchObject({
        statusCode: 500,
        message: 'Invalid job data: missing installation info',
      })
  })

  it('should throw 401 when session is missing GitHub token', async () => {
    mockGetJob.mockResolvedValue(validJob)

    // eslint-disable-next-line ts/no-unsafe-assignment
    const sessionWithoutToken = {
      user: { login: 'testuser' },
      secure: undefined,
    } as UserSession

    await expect(verifyJobAccess('job-123', sessionWithoutToken))
      .rejects
      .toMatchObject({
        statusCode: 401,
        message: 'Missing GitHub token',
      })
  })

  it('should throw 403 when user does not have access to the installation', async () => {
    mockGetJob.mockResolvedValue(validJob)
    mockGetUserInstallationIds.mockResolvedValue(new Set([111, 222]))

    await expect(verifyJobAccess('job-123', validSession))
      .rejects
      .toMatchObject({
        statusCode: 403,
        message: 'You do not have access to this job',
      })
  })

  it('should throw 403 when user has empty installation list', async () => {
    mockGetJob.mockResolvedValue(validJob)
    mockGetUserInstallationIds.mockResolvedValue(new Set())

    await expect(verifyJobAccess('job-123', validSession))
      .rejects
      .toMatchObject({
        statusCode: 403,
        message: 'You do not have access to this job',
      })
  })
})
