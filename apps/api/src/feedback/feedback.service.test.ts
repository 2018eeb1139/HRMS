import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { FeedbackService } from './feedback.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const INTERVIEW_ID = 'interview-1'
const INTERVIEWER_ID = 'user-1'
const APP_ID = 'app-1'

const makeInterview = (overrides: Record<string, unknown> = {}) => ({
  id: INTERVIEW_ID,
  applicationId: APP_ID,
  status: 'COMPLETED',
  scheduledAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
  interviewerIds: [INTERVIEWER_ID],
  ...overrides,
})

const makeFeedback = (overrides: Record<string, unknown> = {}) => ({
  id: 'fb-1',
  interviewId: INTERVIEW_ID,
  interviewerId: INTERVIEWER_ID,
  templateId: null,
  scores: { coding: 4, communication: 3 },
  strengths: 'Good problem solving',
  concerns: null,
  notes: null,
  recommendation: 'HIRE',
  submittedAt: new Date(),
  ...overrides,
})

// ── Prisma mock builder ───────────────────────────────────────────────────────

const makePrisma = (overrides: Record<string, unknown> = {}) => ({
  interview: {
    findUnique: vi.fn().mockResolvedValue(makeInterview()),
    findMany: vi.fn().mockResolvedValue([]),
  },
  feedback: {
    create: vi.fn().mockResolvedValue(makeFeedback()),
    findMany: vi.fn().mockResolvedValue([]),
  },
  feedbackTemplate: {
    findUnique: vi.fn().mockResolvedValue(null),
  },
  ...overrides,
})

const makeSummarizer = () => ({
  summarize: vi.fn().mockResolvedValue({
    overall: 'Strong candidate',
    commonStrengths: ['Problem solving'],
    commonConcerns: [],
    conflictingViews: [],
    decisionSupport: 'Recommend hire',
  }),
})

// ── submit ─────────────────────────────────────────────────────────────────────

describe('FeedbackService.submit', () => {
  let prisma: ReturnType<typeof makePrisma>
  let summarizer: ReturnType<typeof makeSummarizer>
  let svc: FeedbackService

  beforeEach(() => {
    prisma = makePrisma()
    summarizer = makeSummarizer()
    svc = new FeedbackService(prisma as never, summarizer as never)
  })

  it('throws NotFoundException when interview does not exist', async () => {
    prisma.interview.findUnique.mockResolvedValue(null)
    await expect(
      svc.submit(
        { interviewId: 'missing', scores: {}, recommendation: 'HIRE' },
        INTERVIEWER_ID,
      ),
    ).rejects.toThrow(NotFoundException)
  })

  it('throws ConflictException on P2002 duplicate feedback', async () => {
    const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' })
    prisma.feedback.create.mockRejectedValue(p2002)
    await expect(
      svc.submit(
        { interviewId: INTERVIEW_ID, scores: { coding: 5 }, recommendation: 'STRONG_HIRE' },
        INTERVIEWER_ID,
      ),
    ).rejects.toThrow(ConflictException)
  })

  it('persists with correct interviewerId and recommendation', async () => {
    const input = {
      interviewId: INTERVIEW_ID,
      scores: { coding: 5 },
      recommendation: 'STRONG_HIRE' as const,
      strengths: 'Excellent',
    }
    await svc.submit(input, INTERVIEWER_ID)

    expect(prisma.feedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        interviewId: INTERVIEW_ID,
        interviewerId: INTERVIEWER_ID,
        recommendation: 'STRONG_HIRE',
        strengths: 'Excellent',
      }),
    })
  })

  it('re-throws non-P2002 errors', async () => {
    const dbErr = new Error('DB connection error')
    prisma.feedback.create.mockRejectedValue(dbErr)
    await expect(
      svc.submit({ interviewId: INTERVIEW_ID, scores: {}, recommendation: 'HOLD' }, INTERVIEWER_ID),
    ).rejects.toThrow('DB connection error')
  })
})

// ── weightedAverage ────────────────────────────────────────────────────────────

describe('FeedbackService.weightedAverage', () => {
  const svc = new FeedbackService({} as never, {} as never)

  it('computes unweighted average with no template', () => {
    const feedbackList = [
      { scores: { coding: 4, communication: 2 } },
      { scores: { coding: 2, communication: 4 } },
    ]
    // 4 numeric values, sum = 12, avg = 3
    expect(svc.weightedAverage(feedbackList)).toBeCloseTo(3)
  })

  it('applies field weights correctly', () => {
    const template = {
      fields: [
        { key: 'coding', label: 'Coding', type: 'rating' as const, weight: 2 },
        { key: 'communication', label: 'Comm', type: 'rating' as const, weight: 1 },
      ],
    }
    const feedbackList = [
      { scores: { coding: 4, communication: 2 } },
    ]
    // weighted: (4*2 + 2*1) / (2+1) = 10/3 ≈ 3.333
    expect(svc.weightedAverage(feedbackList, template)).toBeCloseTo(10 / 3)
  })

  it('ignores text-type fields when template provided', () => {
    const template = {
      fields: [
        { key: 'coding', label: 'Coding', type: 'rating' as const, weight: 1 },
        { key: 'openEndedNotes', label: 'Notes', type: 'text' as const },
      ],
    }
    const feedbackList = [
      { scores: { coding: 5, openEndedNotes: 'Great' } },
    ]
    // Only coding (numeric rating) counts
    expect(svc.weightedAverage(feedbackList, template)).toBeCloseTo(5)
  })

  it('ignores non-numeric scores even without a template', () => {
    const feedbackList = [
      { scores: { coding: 4, notes: 'text value' } },
    ]
    // Only coding (4) is numeric
    expect(svc.weightedAverage(feedbackList)).toBeCloseTo(4)
  })

  it('returns NaN for empty feedback list', () => {
    expect(svc.weightedAverage([])).toBeNaN()
  })

  it('applies default weight of 1 for fields without explicit weight', () => {
    const template = {
      fields: [
        { key: 'a', label: 'A', type: 'rating' as const },
        { key: 'b', label: 'B', type: 'rating' as const },
      ],
    }
    const feedbackList = [{ scores: { a: 3, b: 5 } }]
    // (3*1 + 5*1) / 2 = 4
    expect(svc.weightedAverage(feedbackList, template)).toBeCloseTo(4)
  })
})

// ── tracking ──────────────────────────────────────────────────────────────────

describe('FeedbackService.tracking', () => {
  let prisma: ReturnType<typeof makePrisma>
  let svc: FeedbackService

  beforeEach(() => {
    prisma = makePrisma()
    svc = new FeedbackService(prisma as never, {} as never)
  })

  it('counts submitted feedback from COMPLETED interviews', async () => {
    const interviewWithFeedback = {
      id: 'i1',
      applicationId: 'app-1',
      scheduledAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      feedback: [{ id: 'fb1', recommendation: 'HIRE' }],
      application: { id: 'app-1' },
    }
    prisma.interview.findMany.mockResolvedValue([interviewWithFeedback])

    const result = await svc.tracking()
    expect(result.submitted).toBe(1)
    expect(result.pending).toBe(0)
  })

  it('marks pending when COMPLETED interview has no feedback', async () => {
    const noFeedback = {
      id: 'i2',
      applicationId: 'app-2',
      scheduledAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
      feedback: [],
      application: { id: 'app-2' },
    }
    prisma.interview.findMany.mockResolvedValue([noFeedback])

    const result = await svc.tracking()
    expect(result.pending).toBe(1)
    // 2h < 24h → not delayed
    expect(result.delayed).toBe(0)
  })

  it('marks delayed when COMPLETED interview has no feedback and is >24h old', async () => {
    const oldNoFeedback = {
      id: 'i3',
      applicationId: 'app-3',
      scheduledAt: new Date(Date.now() - 30 * 60 * 60 * 1000), // 30h ago
      feedback: [],
      application: { id: 'app-3' },
    }
    prisma.interview.findMany.mockResolvedValue([oldNoFeedback])

    const result = await svc.tracking()
    expect(result.pending).toBe(1)
    expect(result.delayed).toBe(1)
  })

  it('detects conflicting recommendations (HIRE + REJECT on same application)', async () => {
    const interview1 = {
      id: 'i4',
      applicationId: 'app-conflict',
      scheduledAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
      feedback: [{ id: 'fb-hire', recommendation: 'HIRE' }],
      application: { id: 'app-conflict' },
    }
    const interview2 = {
      id: 'i5',
      applicationId: 'app-conflict',
      scheduledAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      feedback: [{ id: 'fb-reject', recommendation: 'REJECT' }],
      application: { id: 'app-conflict' },
    }
    prisma.interview.findMany.mockResolvedValue([interview1, interview2])

    const result = await svc.tracking()
    expect(result.conflicting).toContain('app-conflict')
    expect(result.conflicting).toHaveLength(1)
  })

  it('does not flag application with STRONG_HIRE and HIRE as conflicting', async () => {
    const i1 = {
      id: 'i6', applicationId: 'app-ok',
      scheduledAt: new Date(), feedback: [{ id: 'f1', recommendation: 'STRONG_HIRE' }],
      application: { id: 'app-ok' },
    }
    const i2 = {
      id: 'i7', applicationId: 'app-ok',
      scheduledAt: new Date(), feedback: [{ id: 'f2', recommendation: 'HIRE' }],
      application: { id: 'app-ok' },
    }
    prisma.interview.findMany.mockResolvedValue([i1, i2])

    const result = await svc.tracking()
    expect(result.conflicting).toHaveLength(0)
  })
})

// ── aiSummary ─────────────────────────────────────────────────────────────────

describe('FeedbackService.aiSummary', () => {
  it('maps feedback fields and calls summarizer, returning its output', async () => {
    const prisma = makePrisma()
    const summarizer = makeSummarizer()
    const svc = new FeedbackService(prisma as never, summarizer as never)

    const fbList = [
      makeFeedback({ interviewerId: 'u1', recommendation: 'HIRE', strengths: 'Great', concerns: 'Minor gaps', notes: 'Good overall' }),
      makeFeedback({ id: 'fb-2', interviewerId: 'u2', recommendation: 'STRONG_HIRE', strengths: 'Excellent', concerns: null, notes: null }),
    ]

    // listForApplication goes through findMany for interviews then feedback
    prisma.interview.findMany.mockResolvedValue([{ id: INTERVIEW_ID }])
    prisma.feedback.findMany.mockResolvedValue(fbList)

    const expectedSummary = {
      overall: 'Strong candidate',
      commonStrengths: ['Problem solving'],
      commonConcerns: [],
      conflictingViews: [],
      decisionSupport: 'Recommend hire',
    }
    summarizer.summarize.mockResolvedValue(expectedSummary)

    const result = await svc.aiSummary(APP_ID)

    // Verify summarizer was called with correctly mapped input
    expect(summarizer.summarize).toHaveBeenCalledWith({
      feedback: expect.arrayContaining([
        expect.objectContaining({ interviewer: 'u1', recommendation: 'HIRE', strengths: 'Great' }),
        expect.objectContaining({ interviewer: 'u2', recommendation: 'STRONG_HIRE', strengths: 'Excellent' }),
      ]),
    })
    // Returns the summarizer's output directly
    expect(result).toEqual(expectedSummary)
  })

  it('calls summarizer with empty array when no interviews exist', async () => {
    const prisma = makePrisma()
    const summarizer = makeSummarizer()
    const svc = new FeedbackService(prisma as never, summarizer as never)

    prisma.interview.findMany.mockResolvedValue([])

    await svc.aiSummary('no-interviews-app')

    expect(summarizer.summarize).toHaveBeenCalledWith({ feedback: [] })
  })
})
