import { describe, it, expect } from 'vitest'
import {
  createCandidateSchema,
  updateCandidateSchema,
  candidateSourceSchema,
  normalizeCandidatePhone,
} from './candidates.schemas'

describe('normalizeCandidatePhone', () => {
  it('normalizes phone formatting for duplicate checks', () => {
    expect(normalizeCandidatePhone('+1 (555) 123-4567')).toBe('15551234567')
  })

  it('returns null when no digits are present', () => {
    expect(normalizeCandidatePhone('---')).toBeNull()
    expect(normalizeCandidatePhone(undefined)).toBeNull()
  })
})

describe('candidateSourceSchema', () => {
  it('accepts all valid sources', () => {
    const sources = ['HR_UPLOAD', 'REFERRAL', 'LINKEDIN', 'JOB_PORTAL', 'AGENCY', 'DIRECT', 'TALENT_POOL', 'INTERNAL']
    sources.forEach((s) => expect(candidateSourceSchema.safeParse(s).success).toBe(true))
  })
  it('rejects unknown source', () => {
    expect(candidateSourceSchema.safeParse('UNKNOWN').success).toBe(false)
  })
})

describe('createCandidateSchema', () => {
  it('accepts minimal input with only name', () => {
    const result = createCandidateSchema.parse({ name: 'Alice Smith' })
    expect(result.name).toBe('Alice Smith')
    expect(result.skills).toEqual([])
    expect(result.certifications).toEqual([])
    expect(result.tags).toEqual([])
  })
  it('rejects missing name', () => {
    expect(createCandidateSchema.safeParse({}).success).toBe(false)
  })
  it('rejects empty name', () => {
    expect(createCandidateSchema.safeParse({ name: '' }).success).toBe(false)
  })
  it('rejects invalid email', () => {
    expect(createCandidateSchema.safeParse({ name: 'Bob', email: 'not-an-email' }).success).toBe(false)
  })
  it('rejects a phone number without digits', () => {
    expect(createCandidateSchema.safeParse({ name: 'Bob', phone: '---' }).success).toBe(false)
  })
  it('accepts valid email', () => {
    const result = createCandidateSchema.parse({ name: 'Bob', email: 'bob@example.com' })
    expect(result.email).toBe('bob@example.com')
  })
  it('accepts a residential address', () => {
    const result = createCandidateSchema.parse({
      name: 'Bob',
      address: '12 Example Street, Bengaluru',
    })
    expect(result.address).toBe('12 Example Street, Bengaluru')
  })
  it('accepts omitted email (nullable dedup key)', () => {
    const result = createCandidateSchema.parse({ name: 'Anonymous' })
    expect(result.email).toBeUndefined()
  })
  it('rejects invalid linkedinUrl', () => {
    expect(createCandidateSchema.safeParse({ name: 'Bob', linkedinUrl: 'not-a-url' }).success).toBe(false)
  })
  it('accepts full candidate', () => {
    const result = createCandidateSchema.parse({
      name: 'Carol',
      email: 'carol@example.com',
      skills: ['TypeScript', 'React'],
      source: 'LINKEDIN',
      tags: ['senior'],
      yearsExperience: 5,
    })
    expect(result.source).toBe('LINKEDIN')
    expect(result.skills).toEqual(['TypeScript', 'React'])
  })
})

describe('updateCandidateSchema', () => {
  it('accepts empty object', () => {
    expect(updateCandidateSchema.parse({})).toEqual({})
  })
  it('accepts partial update', () => {
    const result = updateCandidateSchema.parse({ name: 'Updated Name' })
    expect(result.name).toBe('Updated Name')
  })
  it('rejects invalid email on partial update', () => {
    expect(updateCandidateSchema.safeParse({ email: 'bad' }).success).toBe(false)
  })
})
