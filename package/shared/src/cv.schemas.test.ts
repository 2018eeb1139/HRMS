import { describe, it, expect } from 'vitest'
import { parsedCvSchema } from './cv.schemas'

describe('parsedCvSchema', () => {
  it('parses a full object with all fields', () => {
    const input = {
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+1-555-0100',
      location: 'London, UK',
      currentTitle: 'Senior Engineer',
      currentEmployer: 'Acme Corp',
      totalYearsExperience: 8,
      education: 'BSc Computer Science, UCL',
      skills: ['TypeScript', 'React', 'Node.js'],
      certifications: ['AWS Solutions Architect'],
      previousCompanies: ['StartupX', 'BigCo'],
      noticePeriod: '1 month',
      salaryDetails: '£80,000',
    }

    const result = parsedCvSchema.parse(input)

    expect(result.name).toBe('Jane Doe')
    expect(result.email).toBe('jane@example.com')
    expect(result.currentTitle).toBe('Senior Engineer')
    expect(result.currentEmployer).toBe('Acme Corp')
    expect(result.totalYearsExperience).toBe(8)
    expect(result.skills).toEqual(['TypeScript', 'React', 'Node.js'])
    expect(result.certifications).toEqual(['AWS Solutions Architect'])
    expect(result.previousCompanies).toEqual(['StartupX', 'BigCo'])
  })

  it('defaults arrays to [] when omitted', () => {
    const result = parsedCvSchema.parse({})

    expect(result.skills).toEqual([])
    expect(result.certifications).toEqual([])
    expect(result.previousCompanies).toEqual([])
    expect(result.name).toBeUndefined()
    expect(result.email).toBeUndefined()
    expect(result.currentTitle).toBeUndefined()
  })

  it('rejects invalid email', () => {
    const result = parsedCvSchema.safeParse({ email: 'not-an-email' })
    expect(result.success).toBe(false)
  })

  it('rejects negative totalYearsExperience', () => {
    const result = parsedCvSchema.safeParse({ totalYearsExperience: -1 })
    expect(result.success).toBe(false)
  })

  it('rounds fractional totalYearsExperience to the nearest whole year', () => {
    const result = parsedCvSchema.parse({ totalYearsExperience: 4.7 })
    expect(result.totalYearsExperience).toBe(5)
  })
})
