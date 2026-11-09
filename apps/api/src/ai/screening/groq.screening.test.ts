import { describe, expect, it, vi } from 'vitest'
import { GroqScreeningService } from './groq.screening'
import { screeningResultSchema } from '@picode-hr/shared'
import type { ScreeningInput, ScreeningResult } from '@picode-hr/shared'

const validResult: ScreeningResult = {
  matchScore: 99,
  skillsMatch: 99,
  experienceMatch: 85,
  seniorityFit: 100,
  industryRelevance: 70,
  locationFit: 100,
  summary: 'Strong fit with relevant skills and experience.',
  matchedRequiredSkills: ['typescript', 'Node.js', 'Unlisted skill'],
  missingRequiredSkills: [],
  strengths: ['Relevant engineering experience'],
  gaps: [],
  riskFlags: [],
  suggestedHrQuestions: ['What interests you about this role?'],
  suggestedInterviewerQuestions: ['Describe a recent technical challenge.'],
  recommendationCategory: 'STRONG_SHORTLIST',
}

const sampleInput: ScreeningInput = {
  candidate: {
    skills: ['TypeScript', 'Node.js'],
    yearsExperience: 5,
    location: 'London',
  },
  role: {
    requiredSkills: ['TypeScript', 'NestJS', 'Node.js'],
    preferredSkills: ['PostgreSQL'],
    requiredYearsExperience: 4,
    seniority: 'Senior',
    location: 'London',
  },
}

const makeFakeCache = () => ({
  getOrCompute: async <T>({ compute }: { compute: () => Promise<T> }) => compute(),
  hashInput: (input: unknown) => JSON.stringify(input),
})

describe('GroqScreeningService', () => {
  it('returns a validated result and recalculates score and skill lists', async () => {
    const llm = { complete: vi.fn().mockResolvedValue(JSON.stringify(validResult)) }
    const service = new GroqScreeningService(llm as never, makeFakeCache() as never)

    const result = await service.score(sampleInput)

    expect(screeningResultSchema.parse(result)).toEqual(result)
    expect(result.matchedRequiredSkills).toEqual(['TypeScript', 'Node.js'])
    expect(result.missingRequiredSkills).toEqual(['NestJS'])
    expect(result.skillsMatch).toBe(67)
    expect(result.matchScore).toBe(79)
    expect(result.recommendationCategory).toBe('STRONG_SHORTLIST')
  })

  it('uses the Groq model and sends structured candidate and role inputs', async () => {
    const llm = { complete: vi.fn().mockResolvedValue(JSON.stringify(validResult)) }
    const service = new GroqScreeningService(llm as never, makeFakeCache() as never)

    await service.score(sampleInput)

    expect(llm.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.any(String),
        user: expect.stringContaining('"requiredSkills"'),
        system: expect.stringContaining('Assess skills semantically'),
        maxTokens: 2048,
        jsonMode: true,
      }),
    )
  })

  it('accepts JSON surrounded by Markdown code fences', async () => {
    const llm = {
      complete: vi.fn().mockResolvedValue(`\`\`\`json\n${JSON.stringify(validResult)}\n\`\`\``),
    }
    const service = new GroqScreeningService(llm as never, makeFakeCache() as never)

    await expect(service.score(sampleInput)).resolves.toMatchObject({
      matchedRequiredSkills: ['TypeScript', 'Node.js'],
    })
  })

  it('normalizes an unsupported recommendation category using the calculated score', async () => {
    const llm = {
      complete: vi.fn().mockResolvedValue(
        JSON.stringify({
          ...validResult,
          recommendationCategory: 'PROCEED_TO_INTERVIEW',
        }),
      ),
    }
    const service = new GroqScreeningService(llm as never, makeFakeCache() as never)

    const result = await service.score(sampleInput)

    expect(result.recommendationCategory).toBe('STRONG_SHORTLIST')
  })

  it('reports an actionable error when Groq returns incomplete JSON', async () => {
    const llm = { complete: vi.fn().mockResolvedValue('not JSON') }
    const service = new GroqScreeningService(llm as never, makeFakeCache() as never)

    await expect(service.score(sampleInput)).rejects.toThrow(/incomplete or invalid JSON.*retry/i)
  })

  it('throws when Groq output does not match the result schema', async () => {
    const llm = {
      complete: vi.fn().mockResolvedValue(
        JSON.stringify({ ...validResult, matchScore: 200 }),
      ),
    }
    const service = new GroqScreeningService(llm as never, makeFakeCache() as never)

    await expect(service.score(sampleInput)).rejects.toThrow()
  })
})
