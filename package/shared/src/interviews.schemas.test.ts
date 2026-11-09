import { describe, it, expect } from 'vitest'
import {
  interviewStatusSchema,
  scheduleInterviewSchema,
  rescheduleSchema,
  setInterviewStatusSchema,
  suggestSlotsSchema,
} from './interviews.schemas'

describe('interviewStatusSchema', () => {
  it('accepts all valid statuses', () => {
    const statuses = [
      'SCHEDULED',
      'COMPLETED',
      'RESCHEDULED',
      'CANCELLED',
      'CANDIDATE_NO_SHOW',
      'INTERVIEWER_NO_SHOW',
    ] as const
    for (const s of statuses) {
      expect(interviewStatusSchema.parse(s)).toBe(s)
    }
  })

  it('rejects unknown status', () => {
    expect(() => interviewStatusSchema.parse('PENDING')).toThrow()
  })
})

describe('scheduleInterviewSchema', () => {
  it('accepts valid minimal input', () => {
    const result = scheduleInterviewSchema.parse({
      applicationId: 'app1',
      interviewerIds: ['user1'],
      scheduledAt: '2026-07-01T09:00:00Z',
    })
    expect(result.applicationId).toBe('app1')
    expect(result.durationMin).toBe(60)
    expect(result.scheduledAt).toBeInstanceOf(Date)
  })

  it('coerces scheduledAt string to Date', () => {
    const result = scheduleInterviewSchema.parse({
      applicationId: 'app1',
      interviewerIds: ['user1'],
      scheduledAt: '2026-07-01T09:00:00Z',
    })
    expect(result.scheduledAt).toBeInstanceOf(Date)
  })

  it('rejects empty interviewerIds array', () => {
    expect(() =>
      scheduleInterviewSchema.parse({
        applicationId: 'app1',
        interviewerIds: [],
        scheduledAt: '2026-07-01T09:00:00Z',
      }),
    ).toThrow()
  })

  it('rejects missing applicationId', () => {
    expect(() =>
      scheduleInterviewSchema.parse({
        interviewerIds: ['user1'],
        scheduledAt: '2026-07-01T09:00:00Z',
      }),
    ).toThrow()
  })

  it('accepts optional stageKey and meetingLink', () => {
    const result = scheduleInterviewSchema.parse({
      applicationId: 'app1',
      interviewerIds: ['user1'],
      scheduledAt: '2026-07-01T09:00:00Z',
      stageKey: 'TECHNICAL',
      meetingLink: 'https://meet.example.com/abc',
      durationMin: 90,
    })
    expect(result.stageKey).toBe('TECHNICAL')
    expect(result.meetingLink).toBe('https://meet.example.com/abc')
    expect(result.durationMin).toBe(90)
  })
})

describe('rescheduleSchema', () => {
  it('accepts scheduledAt with optional durationMin', () => {
    const result = rescheduleSchema.parse({ scheduledAt: '2026-07-02T10:00:00Z', durationMin: 45 })
    expect(result.scheduledAt).toBeInstanceOf(Date)
    expect(result.durationMin).toBe(45)
  })

  it('accepts scheduledAt without durationMin', () => {
    const result = rescheduleSchema.parse({ scheduledAt: '2026-07-02T10:00:00Z' })
    expect(result.durationMin).toBeUndefined()
  })

  it('rejects missing scheduledAt', () => {
    expect(() => rescheduleSchema.parse({})).toThrow()
  })
})

describe('setInterviewStatusSchema', () => {
  it('accepts a valid status', () => {
    const result = setInterviewStatusSchema.parse({ status: 'COMPLETED' })
    expect(result.status).toBe('COMPLETED')
  })

  it('rejects invalid status', () => {
    expect(() => setInterviewStatusSchema.parse({ status: 'DONE' })).toThrow()
  })
})

describe('suggestSlotsSchema', () => {
  it('accepts valid input', () => {
    const result = suggestSlotsSchema.parse({
      interviewerIds: ['user1', 'user2'],
      fromISO: '2026-07-01T00:00:00Z',
      toISO: '2026-07-05T00:00:00Z',
      durationMin: 60,
    })
    expect(result.interviewerIds).toHaveLength(2)
    expect(result.durationMin).toBe(60)
  })

  it('rejects empty interviewerIds', () => {
    expect(() =>
      suggestSlotsSchema.parse({
        interviewerIds: [],
        fromISO: '2026-07-01T00:00:00Z',
        toISO: '2026-07-05T00:00:00Z',
      }),
    ).toThrow()
  })
})
