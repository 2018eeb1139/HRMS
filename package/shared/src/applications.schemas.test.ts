import { describe, it, expect } from 'vitest'
import {
  applicationStatusSchema,
  createApplicationSchema,
  moveStageSchema,
  bulkMoveSchema,
  rejectApplicationSchema,
  createStageSchema,
} from './applications.schemas'

describe('applicationStatusSchema', () => {
  it('accepts all valid statuses', () => {
    const statuses = ['ACTIVE', 'REJECTED', 'WITHDRAWN', 'HIRED', 'ON_HOLD'] as const
    for (const s of statuses) {
      expect(applicationStatusSchema.parse(s)).toBe(s)
    }
  })

  it('rejects unknown status', () => {
    expect(() => applicationStatusSchema.parse('UNKNOWN')).toThrow()
  })
})

describe('createApplicationSchema', () => {
  it('accepts valid candidateId + roleId', () => {
    const result = createApplicationSchema.parse({ candidateId: 'cand1', roleId: 'role1' })
    expect(result).toEqual({ candidateId: 'cand1', roleId: 'role1' })
  })

  it('rejects empty candidateId', () => {
    expect(() => createApplicationSchema.parse({ candidateId: '', roleId: 'role1' })).toThrow()
  })

  it('rejects missing roleId', () => {
    expect(() => createApplicationSchema.parse({ candidateId: 'cand1' })).toThrow()
  })
})

describe('moveStageSchema', () => {
  it('accepts toStageKey with optional byUserId', () => {
    expect(moveStageSchema.parse({ toStageKey: 'HR_REVIEW', byUserId: 'user1' }))
      .toEqual({ toStageKey: 'HR_REVIEW', byUserId: 'user1' })
  })

  it('accepts without byUserId', () => {
    expect(moveStageSchema.parse({ toStageKey: 'SHORTLISTED' }))
      .toEqual({ toStageKey: 'SHORTLISTED' })
  })

  it('rejects empty toStageKey', () => {
    expect(() => moveStageSchema.parse({ toStageKey: '' })).toThrow()
  })
})

describe('bulkMoveSchema', () => {
  it('accepts array of applicationIds + toStageKey', () => {
    const result = bulkMoveSchema.parse({ applicationIds: ['a1', 'a2'], toStageKey: 'HR_REVIEW' })
    expect(result.applicationIds).toHaveLength(2)
  })

  it('rejects empty applicationIds array', () => {
    expect(() => bulkMoveSchema.parse({ applicationIds: [], toStageKey: 'HR_REVIEW' })).toThrow()
  })
})

describe('rejectApplicationSchema', () => {
  it('accepts non-empty reason', () => {
    expect(rejectApplicationSchema.parse({ reason: 'Not qualified' }))
      .toEqual({ reason: 'Not qualified' })
  })

  it('rejects empty reason', () => {
    expect(() => rejectApplicationSchema.parse({ reason: '' })).toThrow()
  })
})

describe('createStageSchema', () => {
  it('accepts valid stage data', () => {
    const result = createStageSchema.parse({ key: 'CV_RECEIVED', label: 'CV Received', order: 0 })
    expect(result.key).toBe('CV_RECEIVED')
    expect(result.isTerminal).toBeUndefined()
  })

  it('accepts isTerminal flag', () => {
    const result = createStageSchema.parse({ key: 'JOINED', label: 'Joined', order: 10, isTerminal: true })
    expect(result.isTerminal).toBe(true)
  })
})
