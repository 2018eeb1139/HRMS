import { describe, it, expect } from 'vitest'
import { RuleBasedScreeningService } from './rule-based.screening'
import { screeningResultSchema } from '@picode-hr/shared'
import type { ScreeningInput } from '@picode-hr/shared'

const svc = new RuleBasedScreeningService()

const exactMatch: ScreeningInput = {
  candidate: {
    skills: ['TypeScript', 'NestJS', 'PostgreSQL'],
    yearsExperience: 5,
    seniority: 'SENIOR',
    location: 'Berlin',
  },
  role: {
    requiredSkills: ['TypeScript', 'NestJS', 'PostgreSQL'],
    preferredSkills: [],
    requiredYearsExperience: 4,
    seniority: 'SENIOR',
    location: 'Berlin',
  },
}

describe('RuleBasedScreeningService', () => {
  describe('exact-match candidate', () => {
    it('returns a high matchScore (>=75) and STRONG_SHORTLIST', async () => {
      const result = await svc.score(exactMatch)
      expect(result.matchScore).toBeGreaterThanOrEqual(75)
      expect(result.recommendationCategory).toBe('STRONG_SHORTLIST')
    })

    it('output always passes screeningResultSchema', async () => {
      const result = await svc.score(exactMatch)
      expect(() => screeningResultSchema.parse(result)).not.toThrow()
    })

    it('has empty gaps for fully matching skills', async () => {
      const result = await svc.score(exactMatch)
      expect(result.gaps).toHaveLength(0)
    })

    it('has strengths listing the matched required skills', async () => {
      const result = await svc.score(exactMatch)
      expect(result.strengths.length).toBeGreaterThan(0)
    })

    it('returns a concise summary and matched required skills', async () => {
      const result = await svc.score(exactMatch)
      expect(result.summary).toContain('100%')
      expect(result.matchedRequiredSkills).toEqual(['TypeScript', 'NestJS', 'PostgreSQL'])
      expect(result.missingRequiredSkills).toEqual([])
    })
  })

  describe('missing skills', () => {
    it('populates gaps with the missing required skills', async () => {
      const input: ScreeningInput = {
        candidate: {
          skills: ['TypeScript'],
          yearsExperience: 4,
          seniority: 'SENIOR',
          location: 'Berlin',
        },
        role: {
          requiredSkills: ['TypeScript', 'NestJS', 'PostgreSQL'],
          preferredSkills: [],
          requiredYearsExperience: 4,
          seniority: 'SENIOR',
          location: 'Berlin',
        },
      }
      const result = await svc.score(input)
      expect(result.gaps).toContain('NestJS')
      expect(result.gaps).toContain('PostgreSQL')
      expect(result.matchedRequiredSkills).toEqual(['TypeScript'])
      expect(result.missingRequiredSkills).toEqual(['NestJS', 'PostgreSQL'])
    })

    it('returns a lower matchScore than exact match', async () => {
      const partialInput: ScreeningInput = {
        candidate: {
          skills: ['TypeScript'],
          yearsExperience: 4,
          seniority: 'SENIOR',
          location: 'Berlin',
        },
        role: {
          requiredSkills: ['TypeScript', 'NestJS', 'PostgreSQL'],
          preferredSkills: [],
          requiredYearsExperience: 4,
          seniority: 'SENIOR',
          location: 'Berlin',
        },
      }
      const partial = await svc.score(partialInput)
      const full = await svc.score(exactMatch)
      expect(partial.matchScore).toBeLessThan(full.matchScore)
    })

    it('output passes screeningResultSchema for partial match', async () => {
      const input: ScreeningInput = {
        candidate: { skills: ['TypeScript'] },
        role: { requiredSkills: ['TypeScript', 'NestJS', 'PostgreSQL'] },
      }
      const result = await svc.score(input)
      expect(() => screeningResultSchema.parse(result)).not.toThrow()
    })
  })

  describe('below required experience', () => {
    it('adds a riskFlag for below required experience', async () => {
      const input: ScreeningInput = {
        candidate: {
          skills: ['TypeScript', 'NestJS', 'PostgreSQL'],
          yearsExperience: 2,
        },
        role: {
          requiredSkills: ['TypeScript', 'NestJS', 'PostgreSQL'],
          requiredYearsExperience: 5,
        },
      }
      const result = await svc.score(input)
      expect(result.riskFlags.some((f) => f.toLowerCase().includes('experience'))).toBe(true)
    })

    it('returns experienceMatch < 100 when below required years', async () => {
      const input: ScreeningInput = {
        candidate: { skills: ['TypeScript'], yearsExperience: 2 },
        role: { requiredSkills: ['TypeScript'], requiredYearsExperience: 5 },
      }
      const result = await svc.score(input)
      expect(result.experienceMatch).toBeLessThan(100)
    })

    it('returns experienceMatch 100 when years meet requirement', async () => {
      const input: ScreeningInput = {
        candidate: { skills: ['TypeScript'], yearsExperience: 5 },
        role: { requiredSkills: ['TypeScript'], requiredYearsExperience: 5 },
      }
      const result = await svc.score(input)
      expect(result.experienceMatch).toBe(100)
    })

    it('returns experienceMatch 100 when no requirement set', async () => {
      const input: ScreeningInput = {
        candidate: { skills: ['TypeScript'] },
        role: { requiredSkills: ['TypeScript'] },
      }
      const result = await svc.score(input)
      expect(result.experienceMatch).toBe(100)
    })
  })

  describe('seniority matching', () => {
    it('returns seniorityFit 100 when seniority names match (case-insensitive)', async () => {
      const input: ScreeningInput = {
        candidate: { skills: [], seniority: 'senior' },
        role: { requiredSkills: [], seniority: 'SENIOR' },
      }
      const result = await svc.score(input)
      expect(result.seniorityFit).toBe(100)
    })

    it('returns seniorityFit 50 when seniority names differ', async () => {
      const input: ScreeningInput = {
        candidate: { skills: [], seniority: 'JUNIOR' },
        role: { requiredSkills: [], seniority: 'SENIOR' },
      }
      const result = await svc.score(input)
      expect(result.seniorityFit).toBe(50)
    })

    it('returns seniorityFit 100 when no requirement', async () => {
      const input: ScreeningInput = {
        candidate: { skills: [], seniority: 'JUNIOR' },
        role: { requiredSkills: [] },
      }
      const result = await svc.score(input)
      expect(result.seniorityFit).toBe(100)
    })
  })

  describe('location fit', () => {
    it('returns locationFit 100 when locations match (case-insensitive)', async () => {
      const input: ScreeningInput = {
        candidate: { skills: [], location: 'berlin' },
        role: { requiredSkills: [], location: 'Berlin' },
      }
      const result = await svc.score(input)
      expect(result.locationFit).toBe(100)
    })

    it('returns locationFit 60 when locations differ', async () => {
      const input: ScreeningInput = {
        candidate: { skills: [], location: 'Paris' },
        role: { requiredSkills: [], location: 'Berlin' },
      }
      const result = await svc.score(input)
      expect(result.locationFit).toBe(60)
    })

    it('returns locationFit 100 when no role location requirement', async () => {
      const input: ScreeningInput = {
        candidate: { skills: [], location: 'Paris' },
        role: { requiredSkills: [] },
      }
      const result = await svc.score(input)
      expect(result.locationFit).toBe(100)
    })
  })

  describe('matchScore formula', () => {
    it('computes matchScore as 0.5*skillsMatch + 0.3*experienceMatch + 0.2*seniorityFit rounded', async () => {
      // skills: 0/3 = 0, experience: 0 years vs 5 req = 0, seniority mismatch = 50
      const input: ScreeningInput = {
        candidate: { skills: [], yearsExperience: 0, seniority: 'JUNIOR' },
        role: {
          requiredSkills: ['A', 'B', 'C'],
          requiredYearsExperience: 5,
          seniority: 'SENIOR',
        },
      }
      const result = await svc.score(input)
      // skillsMatch=0, experienceMatch=0, seniorityFit=50
      // matchScore = round(0.5*0 + 0.3*0 + 0.2*50) = round(10) = 10
      expect(result.matchScore).toBe(10)
    })
  })

  describe('recommendationCategory thresholds', () => {
    it('assigns STRONG_SHORTLIST for matchScore >= 75', async () => {
      const result = await svc.score(exactMatch)
      expect(result.matchScore).toBeGreaterThanOrEqual(75)
      expect(result.recommendationCategory).toBe('STRONG_SHORTLIST')
    })

    it('assigns NOT_SUITABLE for matchScore < 40', async () => {
      const input: ScreeningInput = {
        candidate: { skills: [], yearsExperience: 0, seniority: 'JUNIOR' },
        role: {
          requiredSkills: ['A', 'B', 'C'],
          requiredYearsExperience: 5,
          seniority: 'SENIOR',
        },
      }
      const result = await svc.score(input)
      expect(result.matchScore).toBeLessThan(40)
      expect(result.recommendationCategory).toBe('NOT_SUITABLE')
    })
  })

  describe('skill matching is case-insensitive', () => {
    it('matches skills regardless of case', async () => {
      const input: ScreeningInput = {
        candidate: { skills: ['typescript', 'nestjs'] },
        role: { requiredSkills: ['TypeScript', 'NestJS'] },
      }
      const result = await svc.score(input)
      expect(result.skillsMatch).toBe(100)
      expect(result.gaps).toHaveLength(0)
    })
  })

  describe('all outputs always valid', () => {
    it('passes schema for no-data input (empty skills + no years/seniority)', async () => {
      const input: ScreeningInput = {
        candidate: { skills: [] },
        role: { requiredSkills: [] },
      }
      const result = await svc.score(input)
      expect(() => screeningResultSchema.parse(result)).not.toThrow()
    })
  })
})
