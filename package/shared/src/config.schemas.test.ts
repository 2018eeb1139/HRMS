import { describe, it, expect } from 'vitest'
import { createDepartmentSchema, headcountCountsOnSchema, inviteUserSchema } from './config.schemas'

describe('config schemas', () => {
  it('accepts a valid department', () => {
    expect(createDepartmentSchema.parse({ name: 'Engineering' })).toEqual({ name: 'Engineering' })
  })
  it('rejects an empty department name', () => {
    expect(createDepartmentSchema.safeParse({ name: '' }).success).toBe(false)
  })
  it('restricts headcountCountsOn to the two allowed values', () => {
    expect(headcountCountsOnSchema.safeParse('OFFER_ACCEPTED').success).toBe(true)
    expect(headcountCountsOnSchema.safeParse('SOMETHING').success).toBe(false)
  })
  it('rejects an invite with an unknown role', () => {
    expect(inviteUserSchema.safeParse({ email: 'a@b.com', name: 'A', role: 'WIZARD' }).success).toBe(false)
  })
})
