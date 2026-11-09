import { describe, it, expect, beforeEach } from 'vitest'
import { saveTokenFromHash, getToken, clearToken } from './client'

describe('token handling', () => {
  beforeEach(() => { localStorage.clear() })

  it('extracts and stores a token from the login hash', () => {
    saveTokenFromHash('#token=abc.def.ghi')
    expect(getToken()).toBe('abc.def.ghi')
  })
  it('returns null when no token is present', () => {
    expect(getToken()).toBeNull()
  })
  it('clears the token', () => {
    saveTokenFromHash('#token=xyz')
    clearToken()
    expect(getToken()).toBeNull()
  })
})
