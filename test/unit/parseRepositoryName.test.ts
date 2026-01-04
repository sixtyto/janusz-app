import { describe, expect, it } from 'vitest'
import { parseRepositoryName } from '~~/server/utils/parseRepositoryName'
import { setupCreateErrorMock } from '../helpers/testHelpers'

setupCreateErrorMock()

describe('parseRepositoryName', () => {
  it('should parse valid owner/repo format', () => {
    const result = parseRepositoryName('owner/repo')

    expect(result).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('should handle complex repo names with dashes and dots', () => {
    const result = parseRepositoryName('my-org/my-awesome.repo')

    expect(result).toEqual({ owner: 'my-org', repo: 'my-awesome.repo' })
  })

  it('should throw error for missing slash', () => {
    expect(() => parseRepositoryName('invalidrepo')).toThrow('Invalid repository name format')
  })

  it('should throw error for too many slashes', () => {
    expect(() => parseRepositoryName('owner/repo/extra')).toThrow('Invalid repository name format')
  })

  it('should throw error for empty owner', () => {
    expect(() => parseRepositoryName('/repo')).toThrow('Invalid repository name format')
  })

  it('should throw error for empty repo', () => {
    expect(() => parseRepositoryName('owner/')).toThrow('Invalid repository name format')
  })

  it('should throw error for empty string', () => {
    expect(() => parseRepositoryName('')).toThrow('Invalid repository name format')
  })
})
