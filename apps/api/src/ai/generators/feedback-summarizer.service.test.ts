import { describe, it, expect, vi } from 'vitest'
import { FeedbackSummarizerService } from './feedback-summarizer.service'
import { feedbackSummarySchema } from '@picode-hr/shared'
import type { FeedbackSummary, FeedbackSummaryInput } from '@picode-hr/shared'

const validSummary: FeedbackSummary = {
  overall: 'Strong candidate with minor experience gaps.',
  commonStrengths: ['Communication', 'TypeScript depth'],
  commonConcerns: ['Limited system design exposure'],
  conflictingViews: ['One interviewer rated leadership HIGH, another rated it LOW'],
  decisionSupport: 'Recommend advancing. Address system design in final round.',
}

const sampleInput: FeedbackSummaryInput = {
  feedback: [
    {
      interviewer: 'Alice',
      recommendation: 'HIRE',
      strengths: 'Great communication',
      concerns: 'Limited system design',
      notes: 'Would be a strong addition',
    },
    {
      interviewer: 'Bob',
      recommendation: 'HOLD',
      strengths: 'TypeScript depth',
      concerns: 'System design gaps',
    },
  ],
}

const makeFakeCache = () => ({
  getOrCompute: vi.fn(async <T>(args: { type: string; inputHash: string; model: string; promptVersion: string; compute: () => Promise<T> }) => args.compute()),
  hashInput: (obj: unknown) => JSON.stringify(obj),
})

describe('FeedbackSummarizerService', () => {
  it('returns parsed FeedbackSummary when FakeLlm returns valid JSON', async () => {
    const fakeLlm = { complete: vi.fn().mockResolvedValue(JSON.stringify(validSummary)) }
    const fakeCache = makeFakeCache()
    const svc = new FeedbackSummarizerService(fakeLlm as never, fakeCache as never)
    const result = await svc.summarize(sampleInput)
    expect(() => feedbackSummarySchema.parse(result)).not.toThrow()
    expect(result.commonStrengths).toContain('Communication')
    expect(result.decisionSupport).toBeTruthy()
  })

  it('strips ```json fences before parsing', async () => {
    const fenced = '```json\n' + JSON.stringify(validSummary) + '\n```'
    const fakeLlm = { complete: vi.fn().mockResolvedValue(fenced) }
    const fakeCache = makeFakeCache()
    const svc = new FeedbackSummarizerService(fakeLlm as never, fakeCache as never)
    const result = await svc.summarize(sampleInput)
    expect(result.overall).toBe(validSummary.overall)
  })

  it('calls getOrCompute with type feedback_summary and a hashed input', async () => {
    const fakeLlm = { complete: vi.fn().mockResolvedValue(JSON.stringify(validSummary)) }
    const fakeCache = makeFakeCache()
    const svc = new FeedbackSummarizerService(fakeLlm as never, fakeCache as never)
    await svc.summarize(sampleInput)
    expect(fakeCache.getOrCompute).toHaveBeenCalledOnce()
    const callArgs = fakeCache.getOrCompute.mock.calls[0][0]
    expect(callArgs.type).toBe('feedback_summary')
    expect(typeof callArgs.inputHash).toBe('string')
  })

  it('throws when FakeLlm returns garbage JSON', async () => {
    const fakeLlm = { complete: vi.fn().mockResolvedValue('totally not json') }
    const fakeCache = makeFakeCache()
    const svc = new FeedbackSummarizerService(fakeLlm as never, fakeCache as never)
    await expect(svc.summarize(sampleInput)).rejects.toThrow()
  })

  it('throws when FakeLlm returns JSON that fails schema validation', async () => {
    const bad = { ...validSummary, commonStrengths: 'not-an-array' }
    const fakeLlm = { complete: vi.fn().mockResolvedValue(JSON.stringify(bad)) }
    const fakeCache = makeFakeCache()
    const svc = new FeedbackSummarizerService(fakeLlm as never, fakeCache as never)
    await expect(svc.summarize(sampleInput)).rejects.toThrow()
  })

  it('does not call LLM on cache hit', async () => {
    const fakeLlm = { complete: vi.fn() }
    const hitCache = {
      getOrCompute: async <T>() => validSummary as unknown as T,
      hashInput: (obj: unknown) => JSON.stringify(obj),
    }
    const svc = new FeedbackSummarizerService(fakeLlm as never, hitCache as never)
    const result = await svc.summarize(sampleInput)
    expect(result.overall).toBe(validSummary.overall)
    expect(fakeLlm.complete).not.toHaveBeenCalled()
  })
})
