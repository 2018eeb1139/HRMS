import { describe, it, expect } from 'vitest'
import {
  communicationTypeSchema,
  createCommunicationSchema,
  updateCommunicationSchema,
  messageDraftKindSchema,
  messageDraftInputSchema,
  messageDraftSchema,
} from './communications.schemas'

describe('communicationTypeSchema', () => {
  it('accepts all valid types', () => {
    const types = [
      'PHONE', 'EMAIL', 'WHATSAPP', 'LINKEDIN',
      'INTERVIEW_DISCUSSION', 'INTERNAL_NOTE', 'OFFER_DISCUSSION', 'FOLLOW_UP',
    ] as const
    for (const t of types) {
      expect(() => communicationTypeSchema.parse(t)).not.toThrow()
    }
  })

  it('rejects invalid type', () => {
    expect(() => communicationTypeSchema.parse('TELEGRAM')).toThrow()
  })
})

describe('createCommunicationSchema', () => {
  it('parses a minimal valid payload', () => {
    const result = createCommunicationSchema.parse({
      candidateId: 'cand-1',
      type: 'EMAIL',
      summary: 'Reached out via email',
    })
    expect(result.candidateId).toBe('cand-1')
    expect(result.type).toBe('EMAIL')
    expect(result.summary).toBe('Reached out via email')
  })

  it('parses a full payload including followUpDate', () => {
    const result = createCommunicationSchema.parse({
      candidateId: 'cand-1',
      applicationId: 'app-1',
      type: 'PHONE',
      summary: 'Discussed the offer',
      candidateResponse: 'Interested',
      nextAction: 'Send offer letter',
      followUpDate: '2026-06-20T10:00:00.000Z',
      attachmentKey: 'uploads/offer.pdf',
    })
    expect(result.followUpDate).toBeInstanceOf(Date)
    expect(result.applicationId).toBe('app-1')
  })

  it('rejects empty summary', () => {
    expect(() =>
      createCommunicationSchema.parse({ candidateId: 'cand-1', type: 'EMAIL', summary: '' }),
    ).toThrow()
  })

  it('rejects empty candidateId', () => {
    expect(() =>
      createCommunicationSchema.parse({ candidateId: '', type: 'EMAIL', summary: 'hi' }),
    ).toThrow()
  })
})

describe('updateCommunicationSchema', () => {
  it('accepts partial updates', () => {
    const result = updateCommunicationSchema.parse({ summary: 'Updated summary' })
    expect(result.summary).toBe('Updated summary')
  })

  it('accepts empty object', () => {
    expect(() => updateCommunicationSchema.parse({})).not.toThrow()
  })
})

describe('messageDraftKindSchema', () => {
  it('accepts all valid kinds', () => {
    const kinds = [
      'INTERVIEW_INVITE', 'SCREENING_REQUEST', 'MISSING_INFO', 'REJECTION',
      'OFFER_FOLLOWUP', 'STATUS_UPDATE', 'INTERVIEW_REMINDER', 'FOLLOW_UP',
    ] as const
    for (const k of kinds) {
      expect(() => messageDraftKindSchema.parse(k)).not.toThrow()
    }
  })

  it('rejects invalid kind', () => {
    expect(() => messageDraftKindSchema.parse('UNKNOWN')).toThrow()
  })
})

describe('messageDraftInputSchema', () => {
  it('parses minimal input', () => {
    const result = messageDraftInputSchema.parse({
      kind: 'INTERVIEW_INVITE',
      candidateName: 'Alice',
    })
    expect(result.kind).toBe('INTERVIEW_INVITE')
    expect(result.candidateName).toBe('Alice')
  })

  it('parses full input', () => {
    const result = messageDraftInputSchema.parse({
      kind: 'REJECTION',
      candidateName: 'Bob',
      roleTitle: 'Backend Engineer',
      context: 'Not enough experience',
    })
    expect(result.roleTitle).toBe('Backend Engineer')
    expect(result.context).toBe('Not enough experience')
  })
})

describe('messageDraftSchema', () => {
  it('parses a valid draft output', () => {
    const result = messageDraftSchema.parse({
      subject: 'Interview Invitation',
      body: 'Dear Alice, we would like to invite you...',
    })
    expect(result.subject).toBe('Interview Invitation')
  })

  it('rejects missing subject', () => {
    expect(() => messageDraftSchema.parse({ body: 'Hello' })).toThrow()
  })
})
