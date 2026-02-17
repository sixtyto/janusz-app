import { JobStatus } from '#shared/types/JobStatus'
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { jobService } from '~~/server/utils/jobService'

// Mock useDatabase
const mockDatabase = {
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  query: {
    jobs: {
      findFirst: vi.fn(),
    },
  },
}

vi.mock('~~/server/utils/useDatabase', () => ({
  useDatabase: () => mockDatabase,
}))

// Mock getPrReviewQueue
const mockQueue = {
  getJob: vi.fn(),
  getJobCounts: vi.fn(),
}

vi.mock('~~/server/utils/getPrReviewQueue', () => ({
  getPrReviewQueue: () => mockQueue,
}))

describe('jobService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getJobs', () => {
    const setupMockDB = (mockJobRecords: any[]) => {
      const mockFrom = vi.fn()
      const mockWhere = vi.fn()
      const mockOrderBy = vi.fn()
      const mockLimit = vi.fn()
      const mockOffset = vi.fn().mockResolvedValue(mockJobRecords)

      mockDatabase.select
        .mockReturnValueOnce({ // for count
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: mockJobRecords.length }]),
          }),
        })
        .mockReturnValueOnce({ // for jobs
          from: mockFrom,
        })

      mockFrom.mockReturnValue({ where: mockWhere })
      mockWhere.mockReturnValue({ orderBy: mockOrderBy })
      mockOrderBy.mockReturnValue({ limit: mockLimit })
      mockLimit.mockReturnValue({ offset: mockOffset })
    }

    it('should return attempts from BullMQ for active jobs', async () => {
      // Mock DB response
      const mockJobRecords = [
        {
          id: 'job-1',
          repositoryFullName: 'owner/repo',
          installationId: 123,
          pullRequestNumber: 42,
          attempts: 1, // DB says 1 attempt
          status: JobStatus.ACTIVE,
          createdAt: new Date(),
          processedAt: new Date(),
          finishedAt: null,
          failedReason: null,
          executionHistory: null,
        },
      ]

      setupMockDB(mockJobRecords)

      // Mock BullMQ response
      mockQueue.getJob.mockResolvedValue({
        id: 'job-1',
        attemptsMade: 5, // BullMQ says 5 attempts
      })

      const result = await jobService.getJobs({
        installationIds: new Set([123]),
      })

      expect(result.jobs).toHaveLength(1)
      expect(result.jobs[0].id).toBe('job-1')
      expect(result.jobs[0].attemptsMade).toBe(5)

      // Verify BullMQ was called
      expect(mockQueue.getJob).toHaveBeenCalledWith('job-1')
    })

    it('should fall back to DB attempts if BullMQ lookup fails', async () => {
      // Mock DB response
      const mockJobRecords = [
        {
          id: 'job-1',
          repositoryFullName: 'owner/repo',
          installationId: 123,
          pullRequestNumber: 42,
          attempts: 1,
          status: JobStatus.ACTIVE,
          createdAt: new Date(),
          processedAt: new Date(),
          finishedAt: null,
          failedReason: null,
          executionHistory: null,
        },
      ]

      setupMockDB(mockJobRecords)

      // Mock BullMQ failure
      mockQueue.getJob.mockRejectedValue(new Error('Redis error'))

      const result = await jobService.getJobs({
        installationIds: new Set([123]),
      })

      expect(result.jobs).toHaveLength(1)
      expect(result.jobs[0].id).toBe('job-1')
      expect(result.jobs[0].attemptsMade).toBe(1) // Should be DB value

      expect(mockQueue.getJob).toHaveBeenCalledWith('job-1')
    })

    it('should fall back to DB attempts if BullMQ returns null job', async () => {
      // Mock DB response
      const mockJobRecords = [
        {
          id: 'job-1',
          repositoryFullName: 'owner/repo',
          installationId: 123,
          pullRequestNumber: 42,
          attempts: 1,
          status: JobStatus.ACTIVE,
          createdAt: new Date(),
          processedAt: new Date(),
          finishedAt: null,
          failedReason: null,
          executionHistory: null,
        },
      ]

      setupMockDB(mockJobRecords)

      // Mock BullMQ returns null (job not found in queue anymore)
      mockQueue.getJob.mockResolvedValue(null)

      const result = await jobService.getJobs({
        installationIds: new Set([123]),
      })

      expect(result.jobs).toHaveLength(1)
      expect(result.jobs[0].id).toBe('job-1')
      expect(result.jobs[0].attemptsMade).toBe(1) // Should be DB value

      expect(mockQueue.getJob).toHaveBeenCalledWith('job-1')
    })

    it('should not call BullMQ for completed/failed jobs', async () => {
      // Mock DB response
      const mockJobRecords = [
        {
          id: 'job-1',
          repositoryFullName: 'owner/repo',
          installationId: 123,
          pullRequestNumber: 42,
          attempts: 2,
          status: JobStatus.COMPLETED,
          createdAt: new Date(),
          processedAt: new Date(),
          finishedAt: new Date(),
          failedReason: null,
          executionHistory: null,
        },
      ]

      setupMockDB(mockJobRecords)

      const result = await jobService.getJobs({
        installationIds: new Set([123]),
      })

      expect(result.jobs).toHaveLength(1)
      expect(result.jobs[0].id).toBe('job-1')
      expect(result.jobs[0].attemptsMade).toBe(2)

      // Verify BullMQ was NOT called
      expect(mockQueue.getJob).not.toHaveBeenCalled()
    })
  })
})
