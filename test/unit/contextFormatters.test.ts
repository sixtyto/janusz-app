// @vitest-environment node
import type { FileDiff } from '#shared/types/FileDiff'
import { describe, expect, it } from 'vitest'
import { formatDiffContext, formatDiffSummary, formatReplyContext } from '~~/server/utils/contextFormatters'

describe('contextFormatters', () => {
  describe('formatDiffContext', () => {
    it('should format diffs without extra context', () => {
      const diffs: FileDiff[] = [
        { filename: 'app.ts', patch: '@@ -1,1 +1,1 @@\n-old\n+new', status: 'modified' },
      ]

      const result = formatDiffContext(diffs)

      expect(result).toContain('## FILES TO REVIEW')
      expect(result).toContain('### FILE: app.ts')
      expect(result).toContain('-old')
      expect(result).toContain('+new')
      expect(result).not.toContain('READ-ONLY CONTEXT')
    })

    it('should include extra context before diffs', () => {
      const diffs: FileDiff[] = [
        { filename: 'app.ts', patch: 'patch content', status: 'modified' },
      ]
      const extraContext = {
        'types.ts': 'export interface User { name: string }',
      }

      const result = formatDiffContext(diffs, extraContext)

      expect(result).toContain('## READ-ONLY CONTEXT')
      expect(result).toContain('### FILE: types.ts')
      expect(result).toContain('export interface User')
      expect(result).toContain('## END READ-ONLY CONTEXT')
      expect(result).toContain('## FILES TO REVIEW')
    })

    it('should truncate when exceeding max chars', () => {
      const largePatch = 'x'.repeat(260_000)
      const diffs: FileDiff[] = [
        { filename: 'large.ts', patch: largePatch, status: 'modified' },
        { filename: 'small.ts', patch: 'small patch', status: 'modified' },
      ]

      const result = formatDiffContext(diffs)

      expect(result).toContain('truncated due to size limit')
      expect(result).not.toContain('small.ts')
    })

    it('should handle empty diffs array', () => {
      const result = formatDiffContext([])

      expect(result).toContain('## FILES TO REVIEW')
    })
  })

  describe('formatReplyContext', () => {
    it('should format thread history with file context', () => {
      const threadHistory = [
        { author: 'janusz-app[bot]', body: 'This looks suspicious.' },
        { author: 'developer', body: 'Why do you think so?' },
      ]

      const result = formatReplyContext(threadHistory, 'app.ts', '@@ -1 +1 @@\n+code')

      expect(result).toContain('### FILE: app.ts')
      expect(result).toContain('### DIFF:')
      expect(result).toContain('+code')
      expect(result).toContain('### THREAD HISTORY:')
      expect(result).toContain('janusz-app[bot]: This looks suspicious.')
      expect(result).toContain('developer: Why do you think so?')
    })

    it('should truncate overly long context', () => {
      const longBody = 'a'.repeat(260_000)
      const threadHistory = [{ author: 'user', body: longBody }]

      const result = formatReplyContext(threadHistory, 'file.ts', 'patch')

      expect(result).toContain('(truncated)')
      expect(result.length).toBeLessThan(260_000)
    })
  })

  describe('formatDiffSummary', () => {
    it('should create summary with status and patch snippet', () => {
      const diffs: FileDiff[] = [
        { filename: 'app.ts', patch: 'first 200 chars of patch here...', status: 'modified' },
        { filename: 'new.ts', patch: 'new file content', status: 'added' },
      ]

      const result = formatDiffSummary(diffs)

      expect(result).toContain('### FILE: app.ts')
      expect(result).toContain('**Status**: modified')
      expect(result).toContain('### FILE: new.ts')
      expect(result).toContain('**Status**: added')
      expect(result).toContain('**Patch Snippet**:')
    })

    it('should handle missing patch gracefully', () => {
      const diffs: FileDiff[] = [
        { filename: 'binary.png', status: 'modified', patch: '' },
      ]

      const result = formatDiffSummary(diffs)

      expect(result).toContain('### FILE: binary.png')
      expect(result).toContain('**Status**: modified')
    })
  })
})
