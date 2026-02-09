// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { sanitizeLogMeta } from '../../server/utils/sanitizeLogMeta'

describe('sanitizeLogMeta', () => {
  it('should return null or undefined as is', () => {
    expect(sanitizeLogMeta(null)).toBeNull()
    expect(sanitizeLogMeta(undefined)).toBeUndefined()
  })

  it('should return non-object meta as is', () => {
    expect(sanitizeLogMeta({})).toEqual({})
  })

  it('should return meta without error as is', () => {
    const meta = { foo: 'bar', baz: 123 }
    const result = sanitizeLogMeta(meta)
    expect(result).toEqual(meta)
    expect(result).not.toBe(meta) // Should be a copy
  })

  it('should strip stack trace from error object', () => {
    const meta = {
      foo: 'bar',
      error: {
        message: 'Something went wrong',
        stack: 'Error: Something went wrong\n    at func (file.ts:1:1)',
        name: 'Error',
      },
    }

    const result = sanitizeLogMeta(meta) as any

    expect(result.error).toBeDefined()
    expect(result.error.message).toBe('Something went wrong')
    expect(result.error.name).toBe('Error')
    expect(result.error.stack).toBeUndefined()
    expect(result.foo).toBe('bar')
  })

  it('should not modify original meta object', () => {
    const meta = {
      error: {
        message: 'Original',
        stack: 'Original Stack',
      },
    }

    const result = sanitizeLogMeta(meta)

    expect(meta.error.stack).toBe('Original Stack')
    expect((result as any).error.stack).toBeUndefined()
  })

  it('should handle error not being an object', () => {
    const meta = {
      error: 'Something went wrong string',
    }
    const result = sanitizeLogMeta(meta)
    expect(result).toEqual(meta)
  })
})
