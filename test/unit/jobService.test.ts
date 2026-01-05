import { describe, expect, it, vi } from 'vitest'

const mockQueue = {
  getJob: vi.fn(),
  getJobs: vi.fn(),
  getJobCounts: vi.fn(),
}
vi.stubGlobal('getPrReviewQueue', () => mockQueue)

vi.mock('~~/server/utils/jobIndex', () => ({
  getPaginatedJobIdsForInstallations: vi.fn().mockResolvedValue({ jobIds: [], total: 0 }),
}))

describe('jobService', () => {
  it('should return empty list if installationIds is undefined', async () => {
    const { jobService } = await import('../../server/utils/jobService')

    mockQueue.getJobs.mockClear()

    const result = await jobService.getJobs({})

    expect(result.jobs).toHaveLength(0)
    expect(result.total).toBe(0)
    expect(mockQueue.getJobs).not.toHaveBeenCalled()
  })

  it('should return empty list if installationIds is empty', async () => {
    const { jobService } = await import('../../server/utils/jobService')

    mockQueue.getJobs.mockClear()

    const result = await jobService.getJobs({ installationIds: new Set() })

    expect(result.jobs).toHaveLength(0)
    expect(result.total).toBe(0)
    expect(mockQueue.getJobs).not.toHaveBeenCalled()
  })

  it('should use optimized path when installationIds are provided', async () => {
    const { jobService } = await import('../../server/utils/jobService')
    const { getPaginatedJobIdsForInstallations } = await import('~~/server/utils/jobIndex')

    vi.mocked(getPaginatedJobIdsForInstallations).mockResolvedValue({
      jobIds: ['job-1'],
      total: 1,
    })

    mockQueue.getJob.mockResolvedValue({
      toJSON: () => ({ id: 'job-1' }),
      getState: async () => Promise.resolve('active'),
    })

    const result = await jobService.getJobs({ installationIds: new Set([123]) })

    expect(result.jobs).toHaveLength(1)
    expect(result.jobs[0].state).toBe('active')
  })
})
