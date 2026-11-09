import { describe, it, expect, vi } from 'vitest'
import { ClaudeScreeningService } from './claude.screening'
import { screeningResultSchema } from '@picode-hr/shared'
import type { ScreeningInput, ScreeningResult } from '@picode-hr/shared'

const validResult: ScreeningResult = {
  matchScore: 82,
  skillsMatch: 90,
  experienceMatch: 85,
  seniorityFit: 100,
  industryRelevance: 70,
  locationFit: 100,
  summary: 'Strong TypeScript fit with a gap in GraphQL experience.',
  matchedRequiredSkills: ['TypeScript'],
  missingRequiredSkills: ['NestJS'],
  strengths: ['Strong TypeScript background'],
  gaps: ['Missing GraphQL experience'],
  riskFlags: [],
  suggestedHrQuestions: ['Tell me about your remote work experience.'],
  suggestedInterviewerQuestions: ['Walk me through your architecture decisions.'],
  recommendationCategory: 'STRONG_SHORTLIST',
}

const sampleInput: ScreeningInput = {
  candidate: { skills: ['TypeScript', 'NestJS'], yearsExperience: 5, seniority: 'SENIOR', location: 'Berlin' },
  role: { requiredSkills: ['TypeScript', 'NestJS'], preferredSkills: [], requiredYearsExperience: 4, seniority: 'SENIOR', location: 'Berlin' },
}

// Pass-through fake cache: always calls compute
const makeFakeCache = () => ({
  getOrCompute: async <T>({ compute }: { compute: () => Promise<T> }) => compute(),
  hashInput: (obj: unknown) => JSON.stringify(obj),
})

describe('ClaudeScreeningService', () => {
  it('returns parsed ScreeningResult when FakeLlm returns valid JSON', async () => {
    const fakeLlm = { complete: vi.fn().mockResolvedValue(JSON.stringify(validResult)) }
    const fakeCache = makeFakeCache()
    const svc = new ClaudeScreeningService(fakeLlm as never, fakeCache as never)
    const result = await svc.score(sampleInput)
    expect(() => screeningResultSchema.parse(result)).not.toThrow()
    expect(result.matchScore).toBe(82)
    expect(result.recommendationCategory).toBe('STRONG_SHORTLIST')
    expect(result.summary).toContain('Strong TypeScript fit')
    expect(fakeLlm.complete).toHaveBeenCalledOnce()
  })

  it('passes the system prompt and user prompt to LlmPort.complete', async () => {
    const fakeLlm = { complete: vi.fn().mockResolvedValue(JSON.stringify(validResult)) }
    const fakeCache = makeFakeCache()
    const svc = new ClaudeScreeningService(fakeLlm as never, fakeCache as never)
    await svc.score(sampleInput)
    const callArgs = fakeLlm.complete.mock.calls[0][0]
    expect(callArgs).toHaveProperty('system')
    expect(callArgs).toHaveProperty('user')
    expect(typeof callArgs.system).toBe('string')
    expect(typeof callArgs.user).toBe('string')
  })

  it('throws when FakeLlm returns garbage JSON', async () => {
    const fakeLlm = { complete: vi.fn().mockResolvedValue('not valid json at all!!!') }
    const fakeCache = makeFakeCache()
    const svc = new ClaudeScreeningService(fakeLlm as never, fakeCache as never)
    await expect(svc.score(sampleInput)).rejects.toThrow()
  })

  it('throws when FakeLlm returns valid JSON that fails schema validation', async () => {
    const badResult = { ...validResult, matchScore: 200 }
    const fakeLlm = { complete: vi.fn().mockResolvedValue(JSON.stringify(badResult)) }
    const fakeCache = makeFakeCache()
    const svc = new ClaudeScreeningService(fakeLlm as never, fakeCache as never)
    await expect(svc.score(sampleInput)).rejects.toThrow()
  })

  it('uses cache: does not call LLM on a cache hit', async () => {
    const fakeLlm = { complete: vi.fn() }
    // Cache that always returns validResult without calling compute
    const hitCache = {
      getOrCompute: async <T>() => validResult as unknown as T,
      hashInput: (obj: unknown) => JSON.stringify(obj),
    }
    const svc = new ClaudeScreeningService(fakeLlm as never, hitCache as never)
    const result = await svc.score(sampleInput)
    expect(result.matchScore).toBe(82)
    expect(fakeLlm.complete).not.toHaveBeenCalled()
  })
})
