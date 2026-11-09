import { describe, it, expect } from 'vitest'
import { ok, fail } from './envelope'

describe('envelope', () => {
  it('wraps data on success', () => {
    expect(ok({ id: 1 })).toEqual({ success: true, data: { id: 1 }, error: null })
  })
  it('wraps message on failure', () => {
    expect(fail('nope')).toEqual({ success: false, data: null, error: 'nope' })
  })
})
