import { describe, it, expect } from 'vitest'
import { screeningResultSchema, screeningInputSchema } from './screening.schemas'

// ── Valid fixture ─────────────────────────────────────────────────────────────

const validResult = {
  matchScore: 82,
  skillsMatch: 90,
  experienceMatch: 85,
  seniorityFit: 100,
  industryRelevance: 70,
  locationFit: 100,
  summary: 'Strong TypeScript fit with a gap in GraphQL experience.',
  matchedRequiredSkills: ['TypeScript'],
  missingRequiredSkills: ['GraphQL'],
  strengths: ['Strong TypeScript background'],
  gaps: ['Missing GraphQL experience'],
  riskFlags: [],
  suggestedHrQuestions: ['Can you elaborate on your team management experience?'],
  suggestedInterviewerQuestions: ['Walk me through your TypeScript project architecture.'],
  recommendationCategory: 'STRONG_SHORTLIST' as const,
}

describe('screeningResultSchema', () => {
  it('parses a valid screening result', () => {
    const parsed = screeningResultSchema.parse(validResult)
    expect(parsed.matchScore).toBe(82)
    expect(parsed.recommendationCategory).toBe('STRONG_SHORTLIST')
    expect(parsed.strengths).toHaveLength(1)
  })

  it('accepts all valid recommendationCategory values', () => {
    const categories = [
      'STRONG_SHORTLIST',
      'SHORTLIST_MINOR_CONCERNS',
      'NEEDS_HR_CLARIFICATION',
      'NOT_SUITABLE',
      'BETTER_FIT_OTHER_ROLE',
    ] as const
    for (const cat of categories) {
      expect(() =>
        screeningResultSchema.parse({ ...validResult, recommendationCategory: cat }),
      ).not.toThrow()
    }
  })

  it('rejects matchScore above 100', () => {
    expect(() =>
      screeningResultSchema.parse({ ...validResult, matchScore: 101 }),
    ).toThrow()
  })

  it('rejects matchScore below 0', () => {
    expect(() =>
      screeningResultSchema.parse({ ...validResult, matchScore: -1 }),
    ).toThrow()
  })

  it('rejects an invalid recommendationCategory', () => {
    expect(() =>
      screeningResultSchema.parse({ ...validResult, recommendationCategory: 'HIRE_NOW' }),
    ).toThrow()
  })

  it('rejects missing required fields', () => {
    const { matchScore: _m, ...withoutScore } = validResult
    expect(() => screeningResultSchema.parse(withoutScore)).toThrow()
  })

  it('accepts zero scores', () => {
    const zeroResult = {
      ...validResult,
      matchScore: 0,
      skillsMatch: 0,
      experienceMatch: 0,
      seniorityFit: 0,
      industryRelevance: 0,
      locationFit: 0,
      recommendationCategory: 'NOT_SUITABLE' as const,
    }
    expect(() => screeningResultSchema.parse(zeroResult)).not.toThrow()
  })
})

describe('screeningInputSchema', () => {
  it('parses a full screening input', () => {
    const input = screeningInputSchema.parse({
      candidate: {
        skills: ['TypeScript', 'NestJS'],
        yearsExperience: 5,
        seniority: 'SENIOR',
        location: 'Berlin',
      },
      role: {
        requiredSkills: ['TypeScript'],
        preferredSkills: ['GraphQL'],
        requiredYearsExperience: 4,
        seniority: 'SENIOR',
        location: 'Berlin',
      },
    })
    expect(input.candidate.skills).toContain('TypeScript')
    expect(input.role.requiredSkills).toContain('TypeScript')
  })

  it('parses minimal input (only required fields)', () => {
    const input = screeningInputSchema.parse({
      candidate: { skills: [] },
      role: { requiredSkills: [] },
    })
    expect(input.candidate.skills).toHaveLength(0)
    expect(input.role.preferredSkills).toBeUndefined()
  })
})
