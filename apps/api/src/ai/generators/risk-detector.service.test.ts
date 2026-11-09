import { describe, it, expect, vi } from 'vitest'
import { RiskDetectorService } from './risk-detector.service'
import { riskReportSchema } from '@picode-hr/shared'
import type { RiskReport, RiskReportInput } from '@picode-hr/shared'

const validReport: RiskReport = {
  risks: [
    {
      severity: 'HIGH',
      area: 'Retention',
      finding: 'Candidate has changed jobs 4 times in 3 years.',
      suggestedAction: 'Probe motivations and career goals in final round.',
    },
    {
      severity: 'LOW',
      area: 'Skills',
      finding: 'Minor gap in GraphQL experience.',
      suggestedAction: 'Assess learning agility instead.',
    },
  ],
}

const sampleInput: RiskReportInput = {
  signals: [
    { kind: 'JOB_HOPPING', detail: '4 jobs in 3 years' },
    { kind: 'SKILL_GAP', detail: 'No GraphQL experience mentioned' },
  ],
}

const makeFakeCache = () => ({
  getOrCompute: vi.fn(async <T>(args: { type: string; inputHash: string; model: string; promptVersion: string; compute: () => Promise<T> }) => args.compute()),
  hashInput: (obj: unknown) => JSON.stringify(obj),
})

describe('RiskDetectorService', () => {
  it('returns parsed RiskReport when FakeLlm returns valid JSON', async () => {
    const fakeLlm = { complete: vi.fn().mockResolvedValue(JSON.stringify(validReport)) }
    const fakeCache = makeFakeCache()
    const svc = new RiskDetectorService(fakeLlm as never, fakeCache as never)
    const result = await svc.detect(sampleInput)
    expect(() => riskReportSchema.parse(result)).not.toThrow()
    expect(result.risks).toHaveLength(2)
    expect(result.risks[0].severity).toBe('HIGH')
  })

  it('strips ```json fences before parsing', async () => {
    const fenced = '```json\n' + JSON.stringify(validReport) + '\n```'
    const fakeLlm = { complete: vi.fn().mockResolvedValue(fenced) }
    const fakeCache = makeFakeCache()
    const svc = new RiskDetectorService(fakeLlm as never, fakeCache as never)
    const result = await svc.detect(sampleInput)
    expect(result.risks[0].severity).toBe('HIGH')
  })

  it('calls getOrCompute with type risk_report and a hashed input', async () => {
    const fakeLlm = { complete: vi.fn().mockResolvedValue(JSON.stringify(validReport)) }
    const fakeCache = makeFakeCache()
    const svc = new RiskDetectorService(fakeLlm as never, fakeCache as never)
    await svc.detect(sampleInput)
    expect(fakeCache.getOrCompute).toHaveBeenCalledOnce()
    const callArgs = fakeCache.getOrCompute.mock.calls[0][0]
    expect(callArgs.type).toBe('risk_report')
    expect(typeof callArgs.inputHash).toBe('string')
  })

  it('throws when FakeLlm returns garbage JSON', async () => {
    const fakeLlm = { complete: vi.fn().mockResolvedValue('not json at all!!!') }
    const fakeCache = makeFakeCache()
    const svc = new RiskDetectorService(fakeLlm as never, fakeCache as never)
    await expect(svc.detect(sampleInput)).rejects.toThrow()
  })

  it('throws when severity is an invalid enum value', async () => {
    const bad = {
      risks: [
        { severity: 'CRITICAL', area: 'Retention', finding: 'Something', suggestedAction: 'Do it' },
      ],
    }
    const fakeLlm = { complete: vi.fn().mockResolvedValue(JSON.stringify(bad)) }
    const fakeCache = makeFakeCache()
    const svc = new RiskDetectorService(fakeLlm as never, fakeCache as never)
    await expect(svc.detect(sampleInput)).rejects.toThrow()
  })

  it('does not call LLM on cache hit', async () => {
    const fakeLlm = { complete: vi.fn() }
    const hitCache = {
      getOrCompute: async <T>() => validReport as unknown as T,
      hashInput: (obj: unknown) => JSON.stringify(obj),
    }
    const svc = new RiskDetectorService(fakeLlm as never, hitCache as never)
    const result = await svc.detect(sampleInput)
    expect(result.risks).toHaveLength(2)
    expect(fakeLlm.complete).not.toHaveBeenCalled()
  })
})
