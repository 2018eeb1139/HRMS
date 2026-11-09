import { describe, it, expect, vi } from 'vitest'
import { MessageDraftService } from './message-draft.service'
import { FakeLlm } from '../ai/fake.llm'

// ── Pass-through cache (no Prisma needed) ─────────────────────────────────────

const makeCache = () => ({
  hashInput: (obj: unknown) => JSON.stringify(obj),
  getOrCompute: async <T>(args: { compute: () => Promise<T> }): Promise<T> => args.compute(),
})

// ── draft — happy paths ───────────────────────────────────────────────────────

describe('MessageDraftService.draft', () => {
  it('returns parsed MessageDraft from clean JSON response', async () => {
    const llm = new FakeLlm(
      JSON.stringify({ subject: 'Interview Invitation', body: 'Dear Alice, we would like to invite you for an interview.' }),
    )
    const svc = new MessageDraftService(llm, makeCache() as never)

    const result = await svc.draft({
      kind: 'INTERVIEW_INVITE',
      candidateName: 'Alice',
      roleTitle: 'Backend Engineer',
    })

    expect(result.subject).toBe('Interview Invitation')
    expect(result.body).toContain('Alice')
  })

  it('strips ```json fences before parsing', async () => {
    const rawJson = '```json\n{"subject":"Screening","body":"Hi Bob, please complete the screening."}\n```'
    const llm = new FakeLlm(rawJson)
    const svc = new MessageDraftService(llm, makeCache() as never)

    const result = await svc.draft({
      kind: 'SCREENING_REQUEST',
      candidateName: 'Bob',
    })

    expect(result.subject).toBe('Screening')
    expect(result.body).toContain('Bob')
  })

  it('strips plain ``` fences before parsing', async () => {
    const rawJson = '```\n{"subject":"Status Update","body":"Dear Carol, here is a status update."}\n```'
    const llm = new FakeLlm(rawJson)
    const svc = new MessageDraftService(llm, makeCache() as never)

    const result = await svc.draft({
      kind: 'STATUS_UPDATE',
      candidateName: 'Carol',
      roleTitle: 'Data Engineer',
    })

    expect(result.subject).toBe('Status Update')
  })

  it('includes kind and candidateName in LLM prompt', async () => {
    let capturedSystem = ''
    let capturedUser = ''
    const llm = new FakeLlm(({ system, user }) => {
      capturedSystem = system ?? ''
      capturedUser = user
      return JSON.stringify({ subject: 'Rejection', body: 'Dear Dave, unfortunately...' })
    })
    const svc = new MessageDraftService(llm, makeCache() as never)

    await svc.draft({
      kind: 'REJECTION',
      candidateName: 'Dave',
      roleTitle: 'Frontend Engineer',
      context: 'Lacked required React skills',
    })

    expect(capturedSystem).toContain('REJECTION')
    expect(capturedSystem).toContain('Dave')
    expect(capturedSystem).toContain('Frontend Engineer')
    expect(capturedUser).toContain('Lacked required React skills')
  })

  it('throws when LLM returns garbage (non-JSON)', async () => {
    const llm = new FakeLlm('Sorry, I cannot generate this message right now.')
    const svc = new MessageDraftService(llm, makeCache() as never)

    await expect(
      svc.draft({ kind: 'FOLLOW_UP', candidateName: 'Eve' }),
    ).rejects.toThrow('non-JSON')
  })

  it('throws when LLM returns JSON missing required fields', async () => {
    const llm = new FakeLlm('{"subject":"Only subject"}')
    const svc = new MessageDraftService(llm, makeCache() as never)

    await expect(
      svc.draft({ kind: 'OFFER_FOLLOWUP', candidateName: 'Frank' }),
    ).rejects.toThrow()
  })
})
