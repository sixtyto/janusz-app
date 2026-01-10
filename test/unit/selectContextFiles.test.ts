import type { FileDiff } from '#shared/types/FileDiff'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { selectContextFiles } from '~~/server/utils/selectContextFiles'
import { createMockLogger, setupRuntimeConfigMock } from '../helpers/testHelpers'

vi.mock('~~/server/utils/useLogger', () => ({
  useLogger: () => createMockLogger(),
}))

setupRuntimeConfigMock()

const mockAskGemini = vi.fn()
vi.mock('~~/server/utils/aiService', () => ({

  askGemini: (...args: unknown[]) => mockAskGemini(...args),
}))

describe('selectContextFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should filter out files already in diffs', async () => {
    const index = {
      'app.ts': ['foo', 'bar'],
      'types.ts': ['User', 'Product'],
      'utils.ts': ['helper'],
    }
    const diffs: FileDiff[] = [
      { filename: 'app.ts', patch: 'change', status: 'modified' },
    ]

    mockAskGemini.mockResolvedValue(['types.ts', 'utils.ts'])

    const result = await selectContextFiles(index, diffs)

    expect(result).not.toContain('app.ts')
    expect(result).toContain('types.ts')
  })

  it('should prioritize files from the same directories as diffs', async () => {
    const index = {
      'src/components/Button.ts': ['Button'],
      'src/components/Input.ts': ['Input'],
      'lib/utils.ts': ['format'],
    }
    const diffs: FileDiff[] = [
      { filename: 'src/components/Form.ts', patch: 'new', status: 'added' },
    ]

    mockAskGemini.mockResolvedValue(['src/components/Button.ts', 'src/components/Input.ts'])

    await selectContextFiles(index, diffs)

    expect(mockAskGemini).toHaveBeenCalledWith(
      expect.stringContaining('SYMBOL MAP'),
      expect.any(Object),
    )
  })

  it('should limit results to 10 files maximum', async () => {
    const index: Record<string, string[]> = {}
    for (let i = 0; i < 20; i++) {
      index[`file${i}.ts`] = ['symbol']
    }
    const diffs: FileDiff[] = [{ filename: 'main.ts', patch: 'x', status: 'modified' }]

    const manyFiles = Array.from({ length: 15 }, (_, i) => `file${i}.ts`)
    mockAskGemini.mockResolvedValue(manyFiles)

    const result = await selectContextFiles(index, diffs)

    expect(result.length).toBeLessThanOrEqual(10)
  })

  it('should return empty array when AI fails', async () => {
    const index = { 'file.ts': ['symbol'] }
    const diffs: FileDiff[] = [{ filename: 'main.ts', patch: 'x', status: 'modified' }]

    mockAskGemini.mockRejectedValue(new Error('AI error'))

    const result = await selectContextFiles(index, diffs)

    expect(result).toEqual([])
  })

  it('should only return files that exist in the index', async () => {
    const index = {
      'real.ts': ['func'],
    }
    const diffs: FileDiff[] = [{ filename: 'main.ts', patch: 'x', status: 'modified' }]

    // AI returns files that don't exist in index
    mockAskGemini.mockResolvedValue(['real.ts', 'nonexistent.ts', 'also-fake.ts'])

    const result = await selectContextFiles(index, diffs)

    expect(result).toEqual(['real.ts'])
    expect(result).not.toContain('nonexistent.ts')
  })
})
