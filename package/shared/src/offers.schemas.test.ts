import { describe, it, expect } from 'vitest'
import {
  offerStatusSchema,
  joiningRiskSchema,
  createOfferSchema,
  updateOfferSchema,
  setOfferStatusSchema,
} from './offers.schemas'

describe('offerStatusSchema', () => {
  it('accepts all valid statuses', () => {
    const statuses = ['TO_BE_PREPARED', 'SENT', 'UNDER_NEGOTIATION', 'ACCEPTED', 'REJECTED', 'JOINED'] as const
    for (const s of statuses) {
      expect(offerStatusSchema.parse(s)).toBe(s)
    }
  })

  it('rejects unknown status', () => {
    expect(() => offerStatusSchema.parse('PENDING')).toThrow()
  })
})

describe('joiningRiskSchema', () => {
  it('accepts LOW, MEDIUM, HIGH', () => {
    expect(joiningRiskSchema.parse('LOW')).toBe('LOW')
    expect(joiningRiskSchema.parse('MEDIUM')).toBe('MEDIUM')
    expect(joiningRiskSchema.parse('HIGH')).toBe('HIGH')
  })

  it('rejects unknown risk', () => {
    expect(() => joiningRiskSchema.parse('CRITICAL')).toThrow()
  })
})

describe('createOfferSchema', () => {
  const requiredOfferData = {
    applicationId: 'app1',
    offeredSalary: 80000,
    expectedJoiningDate: '2026-08-01',
    noticePeriod: '30 days',
  }

  it('requires salary, joining date, and notice period', () => {
    const result = createOfferSchema.parse(requiredOfferData)
    expect(result.applicationId).toBe('app1')
    expect(result.offeredSalary).toBe('80000')
    expect(result.expectedJoiningDate).toBeInstanceOf(Date)
    expect(result.noticePeriod).toBe('30 days')
    expect(() => createOfferSchema.parse({ applicationId: 'app1' })).toThrow()
  })

  it('normalizes numeric offered salary to a string', () => {
    const result = createOfferSchema.parse({
      ...requiredOfferData,
      offeredSalary: 80000,
    })
    expect(result.offeredSalary).toBe('80000')
  })

  it('coerces offerDate string to Date', () => {
    const result = createOfferSchema.parse({
      ...requiredOfferData,
      offerDate: '2026-07-01',
    })
    expect(result.offerDate).toBeInstanceOf(Date)
  })

  it('coerces expectedJoiningDate string to Date', () => {
    const result = createOfferSchema.parse(requiredOfferData)
    expect(result.expectedJoiningDate).toBeInstanceOf(Date)
  })

  it('accepts documentsPending array', () => {
    const result = createOfferSchema.parse({
      ...requiredOfferData,
      documentsPending: ['ID', 'Contract'],
    })
    expect(result.documentsPending).toHaveLength(2)
  })

  it('rejects empty applicationId', () => {
    expect(() => createOfferSchema.parse({ applicationId: '' })).toThrow()
  })

  it('rejects missing applicationId', () => {
    expect(() => createOfferSchema.parse({})).toThrow()
  })
})

describe('updateOfferSchema', () => {
  it('normalizes numeric offered salary to a string', () => {
    const result = updateOfferSchema.parse({ offeredSalary: 80000 })
    expect(result.offeredSalary).toBe('80000')
  })

  it('accepts partial update with joiningRisk', () => {
    const result = updateOfferSchema.parse({ joiningRisk: 'HIGH', noticePeriod: '30 days' })
    expect(result.joiningRisk).toBe('HIGH')
    expect(result.noticePeriod).toBe('30 days')
  })

  it('coerces confirmedJoiningDate', () => {
    const result = updateOfferSchema.parse({ confirmedJoiningDate: '2026-09-01' })
    expect(result.confirmedJoiningDate).toBeInstanceOf(Date)
  })

  it('accepts empty object (all fields optional)', () => {
    expect(() => updateOfferSchema.parse({})).not.toThrow()
  })
})

describe('setOfferStatusSchema', () => {
  it('accepts a valid status', () => {
    const result = setOfferStatusSchema.parse({ status: 'ACCEPTED' })
    expect(result.status).toBe('ACCEPTED')
  })

  it('rejects missing status', () => {
    expect(() => setOfferStatusSchema.parse({})).toThrow()
  })

  it('rejects invalid status', () => {
    expect(() => setOfferStatusSchema.parse({ status: 'MAYBE' })).toThrow()
  })
})
