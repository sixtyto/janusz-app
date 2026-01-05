import { describe, expect, it, vi } from 'vitest'


vi.mock('~~/server/utils/jobIndex', () => ({
    getJobIdsForInstallations: vi.fn(),
}))


vi.stubGlobal('defineEventHandler', <T>(handler: T) => handler)


vi.stubGlobal('requireUserSession', vi.fn().mockResolvedValue({
    secure: { githubToken: 'test-token' },
}))


vi.mock('~~/server/utils/getUserInstallationIds', () => ({
    getUserInstallationIds: vi.fn().mockResolvedValue(new Set([123])),
}))


const mockJob = {
    getState: vi.fn(),
}
const mockQueue = {
    getJob: vi.fn(),
    getJobs: vi.fn(),
}
vi.stubGlobal('getPrReviewQueue', () => mockQueue)

describe('stats.get', () => {
    it('should calculate stats based on indexed job IDs', async () => {
        const { getJobIdsForInstallations } = await import('~~/server/utils/jobIndex')
        const { default: handler } = (await import('../../server/api/dashboard/stats.get')) as { default: (event: unknown) => Promise<{ waiting: number, active: number, completed: number, failed: number, delayed: number }> }


        vi.mocked(getJobIdsForInstallations).mockResolvedValue(new Set(['job1', 'job2', 'job3', 'job4']))


        mockQueue.getJob.mockImplementation(async (id) => {
            if (id === 'job1') {
                return { ...mockJob, getState: vi.fn().mockResolvedValue('active') }
            }
            if (id === 'job2') {
                return { ...mockJob, getState: vi.fn().mockResolvedValue('completed') }
            }
            if (id === 'job3') {
                return { ...mockJob, getState: vi.fn().mockResolvedValue('failed') }
            }
            if (id === 'job4') {
                return null
            }
            return null
        })

        const result = await handler({} as any)

        expect(result).toEqual({
            waiting: 0,
            active: 1,
            completed: 1,
            failed: 1,
            delayed: 0,
        })


        expect(mockQueue.getJob).toHaveBeenCalledTimes(4)
        expect(mockQueue.getJob).toHaveBeenCalledWith('job1')
        expect(mockQueue.getJob).toHaveBeenCalledWith('job2')
        expect(mockQueue.getJob).toHaveBeenCalledWith('job3')
        expect(mockQueue.getJob).toHaveBeenCalledWith('job4')
    })

    it('should return zeros when no jobs exist', async () => {
        const { getJobIdsForInstallations } = await import('~~/server/utils/jobIndex')
        const { default: handler } = (await import('../../server/api/dashboard/stats.get')) as { default: (event: unknown) => Promise<{ waiting: number, active: number, completed: number, failed: number, delayed: number }> }

        vi.mocked(getJobIdsForInstallations).mockResolvedValue(new Set())

        const result = await handler({} as any)

        expect(result).toEqual({
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0,
        })
    })
})
