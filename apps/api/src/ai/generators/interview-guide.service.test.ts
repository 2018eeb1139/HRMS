import { describe, it, expect, vi } from 'vitest'
import { InterviewGuideService } from './interview-guide.service'
import { interviewGuideSchema } from '@picode-hr/shared'
import type { InterviewGuide, InterviewGuideInput } from '@picode-hr/shared'

const validGuide: InterviewGuide = {
  questions: [
    { area: 'Technical', question: 'Explain event loop.', whatToLookFor: 'Clear mental model' },
    { area: 'System Design', question: 'Design a rate limiter.', whatToLookFor: 'Trade-offs' },
  ],
}

const sampleInput: InterviewGuideInput = {
  roleTitle: 'Senior Backend Engineer',
  requiredSkills: ['TypeScript', 'Node.js'],
  candidateGaps: ['GraphQL'],
  seniority: 'SENIOR',
}

const makeFakeCache = () => ({
  getOrCompute: vi.fn(async <T>(args: { type: string; inputHash: string; model: string; promptVersion: string; compute: () => Promise<T> }) => args.compute()),
  hashInput: (obj: unknown) => JSON.stringify(obj),
})

describe('InterviewGuideService', () => {
  it('returns parsed InterviewGuide when FakeLlm returns valid JSON', async () => {
    const fakeLlm = { complete: vi.fn().mockResolvedValue(JSON.stringify(validGuide)) }
    const fakeCache = makeFakeCache()
    const svc = new InterviewGuideService(fakeLlm as never, fakeCache as never)
    const result = await svc.generate(sampleInput)
    expect(() => interviewGuideSchema.parse(result)).not.toThrow()
    expect(result.questions).toHaveLength(2)
    expect(result.questions[0].area).toBe('Technical')
  })

  it('strips ```json fences before parsing', async () => {
    const fenced = '```json\n' + JSON.stringify(validGuide) + '\n```'
    const fakeLlm = { complete: vi.fn().mockResolvedValue(fenced) }
    const fakeCache = makeFakeCache()
    const svc = new InterviewGuideService(fakeLlm as never, fakeCache as never)
    const result = await svc.generate(sampleInput)
    expect(result.questions).toHaveLength(2)
  })

  it('calls getOrCompute with type interview_guide and a hashed input', async () => {
    const fakeLlm = { complete: vi.fn().mockResolvedValue(JSON.stringify(validGuide)) }
    const fakeCache = makeFakeCache()
    const svc = new InterviewGuideService(fakeLlm as never, fakeCache as never)
    await svc.generate(sampleInput)
    expect(fakeCache.getOrCompute).toHaveBeenCalledOnce()
    const callArgs = fakeCache.getOrCompute.mock.calls[0][0]
    expect(callArgs.type).toBe('interview_guide')
    expect(typeof callArgs.inputHash).toBe('string')
  })

  it('throws when FakeLlm returns garbage JSON', async () => {
    const fakeLlm = { complete: vi.fn().mockResolvedValue('not valid json!!!') }
    const fakeCache = makeFakeCache()
    const svc = new InterviewGuideService(fakeLlm as never, fakeCache as never)
    await expect(svc.generate(sampleInput)).rejects.toThrow()
  })

  it('throws when FakeLlm returns JSON that fails schema validation', async () => {
    const bad = { questions: [{ area: 'Tech' }] } // missing question + whatToLookFor
    const fakeLlm = { complete: vi.fn().mockResolvedValue(JSON.stringify(bad)) }
    const fakeCache = makeFakeCache()
    const svc = new InterviewGuideService(fakeLlm as never, fakeCache as never)
    await expect(svc.generate(sampleInput)).rejects.toThrow()
  })

  it('does not call LLM on cache hit', async () => {
    const fakeLlm = { complete: vi.fn() }
    const hitCache = {
      getOrCompute: async <T>() => validGuide as unknown as T,
      hashInput: (obj: unknown) => JSON.stringify(obj),
    }
    const svc = new InterviewGuideService(fakeLlm as never, hitCache as never)
    const result = await svc.generate(sampleInput)
    expect(result.questions).toHaveLength(2)
    expect(fakeLlm.complete).not.toHaveBeenCalled()
  })
})
