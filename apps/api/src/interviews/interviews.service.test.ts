import { describe, it, expect, vi } from 'vitest'
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { InterviewsService, computeFreeSlots } from './interviews.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FAKE_APPLICATION = {
  id: 'app1',
  candidateId: 'cand1',
  roleId: 'role1',
  status: 'ACTIVE',
  createdAt: new Date(),
  candidate: {
    name: 'Jane Smith',
    email: 'jane@example.com',
    cvFiles: [
      {
        storageKey: 'cvs/cand1/resume.pdf',
        originalName: 'resume.pdf',
        mimeType: 'application/pdf',
      },
    ],
  },
  role: {
    title: 'Senior Engineer',
    jobDescription: 'Build reliable services.',
    responsibilities: 'Design APIs\nReview code',
  },
}

const FAKE_INTERVIEW = {
  id: 'iv1',
  applicationId: 'app1',
  stageKey: 'TECHNICAL',
  interviewerIds: ['user1', 'user2'],
  scheduledAt: new Date('2026-07-01T09:00:00Z'),
  durationMin: 60,
  meetingLink: null,
  icsUid: 'uid-abc',
  googleEventId: 'fake-uid-abc',
  status: 'SCHEDULED' as const,
  createdAt: new Date(),
}

const makePrisma = () => ({
  application: {
    findUnique: vi.fn(),
  },
  user: {
    findMany: vi.fn().mockImplementation(({ where }) =>
      Promise.resolve(
        where.id.in.map((id: string) => ({
          id,
          email: `${id}@example.com`,
        })),
      ),
    ),
  },
  interview: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
  },
})

const makeCalendar = () => ({
  freeBusy: vi.fn().mockResolvedValue([]),
  createEvent: vi.fn().mockResolvedValue({ eventId: 'fake-uid-abc', meetingLink: undefined }),
  cancelEvent: vi.fn().mockResolvedValue(undefined),
})

const makeStorage = () => ({
  get: vi.fn().mockResolvedValue(Buffer.from('candidate CV')),
})

const makeService = (prisma: unknown, calendar: unknown, storage = makeStorage()) =>
  new InterviewsService(prisma as never, calendar as never, storage as never)

// ── schedule ───────────────────────────────────────────────────────────────────

describe('InterviewsService.schedule', () => {
  it('throws NotFoundException when application does not exist', async () => {
    const prisma = makePrisma()
    prisma.application.findUnique = vi.fn().mockResolvedValue(null)
    const svc = makeService(prisma, makeCalendar())

    await expect(
      svc.schedule({
        applicationId: 'missing',
        interviewerIds: ['user1'],
        scheduledAt: new Date('2026-07-01T09:00:00Z'),
        durationMin: 60,
      }),
    ).rejects.toThrow(NotFoundException)
  })

  it('requires a candidate email for an interview invitation', async () => {
    const prisma = makePrisma()
    prisma.application.findUnique = vi.fn().mockResolvedValue({
      ...FAKE_APPLICATION,
      candidate: { ...FAKE_APPLICATION.candidate, email: null },
    })
    const calendar = makeCalendar()
    const svc = makeService(prisma, calendar)

    await expect(
      svc.schedule({
        applicationId: 'app1',
        interviewerIds: ['user1'],
        scheduledAt: new Date('2026-07-01T09:00:00Z'),
        durationMin: 60,
      }),
    ).rejects.toThrow(BadRequestException)
    expect(calendar.createEvent).not.toHaveBeenCalled()
  })

  it('requires an uploaded candidate CV for an interview invitation', async () => {
    const prisma = makePrisma()
    prisma.application.findUnique = vi.fn().mockResolvedValue({
      ...FAKE_APPLICATION,
      candidate: { ...FAKE_APPLICATION.candidate, cvFiles: [] },
    })
    const calendar = makeCalendar()
    const svc = makeService(prisma, calendar)

    await expect(
      svc.schedule({
        applicationId: 'app1',
        interviewerIds: ['user1'],
        scheduledAt: new Date('2026-07-01T09:00:00Z'),
        durationMin: 60,
      }),
    ).rejects.toThrow(BadRequestException)
    expect(calendar.createEvent).not.toHaveBeenCalled()
  })

  it('does not create an interview when the candidate CV cannot be retrieved', async () => {
    const prisma = makePrisma()
    const calendar = makeCalendar()
    const storage = makeStorage()
    storage.get.mockRejectedValue(new Error('Storage unavailable'))
    prisma.application.findUnique = vi.fn().mockResolvedValue(FAKE_APPLICATION)

    const svc = makeService(prisma, calendar, storage)
    await expect(
      svc.schedule({
        applicationId: 'app1',
        interviewerIds: ['user1'],
        scheduledAt: new Date('2026-07-01T09:00:00Z'),
        durationMin: 60,
      }),
    ).rejects.toThrow(ServiceUnavailableException)
    expect(calendar.createEvent).not.toHaveBeenCalled()
    expect(prisma.interview.create).not.toHaveBeenCalled()
  })

  it('rejects interviewer IDs that do not resolve to users', async () => {
    const prisma = makePrisma()
    prisma.application.findUnique = vi.fn().mockResolvedValue(FAKE_APPLICATION)
    prisma.user.findMany = vi.fn().mockResolvedValue([])
    const calendar = makeCalendar()
    const svc = makeService(prisma, calendar)

    await expect(
      svc.schedule({
        applicationId: 'app1',
        interviewerIds: ['missing-user'],
        scheduledAt: new Date('2026-07-01T09:00:00Z'),
        durationMin: 60,
      }),
    ).rejects.toThrow(BadRequestException)
    expect(calendar.createEvent).not.toHaveBeenCalled()
  })

  it('calls createEvent and persists interview with SCHEDULED status + googleEventId', async () => {
    const prisma = makePrisma()
    const calendar = makeCalendar()
    const storage = makeStorage()
    prisma.application.findUnique = vi.fn().mockResolvedValue(FAKE_APPLICATION)
    prisma.interview.create = vi.fn().mockResolvedValue(FAKE_INTERVIEW)

    const svc = makeService(prisma, calendar, storage)
    const result = await svc.schedule({
      applicationId: 'app1',
      interviewerIds: ['user1', 'user2'],
      scheduledAt: new Date('2026-07-01T09:00:00Z'),
      durationMin: 60,
    })

    expect(calendar.createEvent).toHaveBeenCalledOnce()
    expect(calendar.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: 'Senior Engineer interview — Jane Smith',
        description: expect.stringContaining('Job description:\nBuild reliable services.'),
        attendees: [
          'jane@example.com',
          'user1@example.com',
          'user2@example.com',
        ],
        attachments: [
          {
            fileName: 'resume.pdf',
            mimeType: 'application/pdf',
            content: Buffer.from('candidate CV'),
          },
        ],
      }),
    )
    expect(storage.get).toHaveBeenCalledWith('cvs/cand1/resume.pdf')
    expect(prisma.interview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          applicationId: 'app1',
          status: 'SCHEDULED',
          googleEventId: 'fake-uid-abc',
        }),
      }),
    )
    expect(result.status).toBe('SCHEDULED')
  })

  it('does not create interview if calendar.createEvent throws', async () => {
    const prisma = makePrisma()
    const calendar = makeCalendar()
    calendar.createEvent = vi.fn().mockRejectedValue(new Error('Google API down'))
    prisma.application.findUnique = vi.fn().mockResolvedValue(FAKE_APPLICATION)

    const svc = makeService(prisma, calendar)
    await expect(
      svc.schedule({
        applicationId: 'app1',
        interviewerIds: ['user1'],
        scheduledAt: new Date('2026-07-01T09:00:00Z'),
        durationMin: 60,
      }),
    ).rejects.toThrow(ServiceUnavailableException)
    expect(prisma.interview.create).not.toHaveBeenCalled()
  })

  it('cancels the calendar event if saving the interview fails', async () => {
    const prisma = makePrisma()
    const calendar = makeCalendar()
    const persistenceError = new Error('Database write failed')
    prisma.application.findUnique = vi.fn().mockResolvedValue(FAKE_APPLICATION)
    prisma.interview.create = vi.fn().mockRejectedValue(persistenceError)

    const svc = makeService(prisma, calendar)
    await expect(
      svc.schedule({
        applicationId: 'app1',
        interviewerIds: ['user1'],
        scheduledAt: new Date('2026-07-01T09:00:00Z'),
        durationMin: 60,
      }),
    ).rejects.toBe(persistenceError)

    expect(calendar.cancelEvent).toHaveBeenCalledWith('fake-uid-abc')
  })

  it('uses meetingLink from createEvent result when provided', async () => {
    const prisma = makePrisma()
    const calendar = makeCalendar()
    calendar.createEvent = vi.fn().mockResolvedValue({
      eventId: 'evt-123',
      meetingLink: 'https://meet.google.com/abc-defg-hij',
    })
    prisma.application.findUnique = vi.fn().mockResolvedValue(FAKE_APPLICATION)
    prisma.interview.create = vi.fn().mockResolvedValue(FAKE_INTERVIEW)

    const svc = makeService(prisma, calendar)
    await svc.schedule({
      applicationId: 'app1',
      interviewerIds: ['user1'],
      scheduledAt: new Date('2026-07-01T09:00:00Z'),
      durationMin: 60,
    })

    expect(prisma.interview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          meetingLink: 'https://meet.google.com/abc-defg-hij',
        }),
      }),
    )
  })
})

// ── cancel ─────────────────────────────────────────────────────────────────────

describe('InterviewsService.cancel', () => {
  it('throws NotFoundException when interview does not exist', async () => {
    const prisma = makePrisma()
    prisma.interview.findUnique = vi.fn().mockResolvedValue(null)
    const svc = makeService(prisma, makeCalendar())
    await expect(svc.cancel('missing')).rejects.toThrow(NotFoundException)
  })

  it('calls calendar.cancelEvent when googleEventId is present', async () => {
    const prisma = makePrisma()
    const calendar = makeCalendar()
    prisma.interview.findUnique = vi.fn().mockResolvedValue(FAKE_INTERVIEW)
    prisma.interview.update = vi.fn().mockResolvedValue({ ...FAKE_INTERVIEW, status: 'CANCELLED' })

    const svc = makeService(prisma, calendar)
    await svc.cancel('iv1')

    expect(calendar.cancelEvent).toHaveBeenCalledWith('fake-uid-abc')
    expect(prisma.interview.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CANCELLED' } }),
    )
  })

  it('does not call cancelEvent when googleEventId is null', async () => {
    const prisma = makePrisma()
    const calendar = makeCalendar()
    prisma.interview.findUnique = vi.fn().mockResolvedValue({ ...FAKE_INTERVIEW, googleEventId: null })
    prisma.interview.update = vi.fn().mockResolvedValue({ ...FAKE_INTERVIEW, status: 'CANCELLED' })

    const svc = makeService(prisma, calendar)
    await svc.cancel('iv1')

    expect(calendar.cancelEvent).not.toHaveBeenCalled()
  })
})

// ── list ───────────────────────────────────────────────────────────────────────

describe('InterviewsService.list', () => {
  it('applies interviewerId filter using { has } Prisma operator', async () => {
    const prisma = makePrisma()
    prisma.interview.findMany = vi.fn().mockResolvedValue([])
    const svc = makeService(prisma, makeCalendar())

    await svc.list({ interviewerId: 'user1' })

    expect(prisma.interview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          interviewerIds: { has: 'user1' },
        }),
      }),
    )
  })

  it('applies applicationId and status filters', async () => {
    const prisma = makePrisma()
    prisma.interview.findMany = vi.fn().mockResolvedValue([])
    const svc = makeService(prisma, makeCalendar())

    await svc.list({ applicationId: 'app1', status: 'COMPLETED' })

    expect(prisma.interview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          applicationId: 'app1',
          status: 'COMPLETED',
        }),
        include: {
          application: {
            select: {
              candidateId: true,
              candidate: { select: { id: true, name: true } },
              currentStage: { select: { label: true } },
            },
          },
        },
      }),
    )
  })

  it('returns interviewer names with each interview', async () => {
    const prisma = makePrisma()
    prisma.interview.findMany = vi.fn().mockResolvedValue([
      { ...FAKE_INTERVIEW, interviewerIds: ['user1', 'user2'] },
    ])
    prisma.user.findMany = vi.fn().mockResolvedValue([
      { id: 'user1', name: 'Alex Interviewer', email: 'alex@example.com' },
      { id: 'user2', name: 'Sam Interviewer', email: 'sam@example.com' },
    ])
    const svc = makeService(prisma, makeCalendar())

    const result = await svc.list({})

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['user1', 'user2'] } },
      select: { id: true, name: true, email: true },
    })
    expect(result[0].interviewers).toEqual([
      { id: 'user1', name: 'Alex Interviewer', email: 'alex@example.com' },
      { id: 'user2', name: 'Sam Interviewer', email: 'sam@example.com' },
    ])
  })
})

// ── computeFreeSlots ───────────────────────────────────────────────────────────

describe('computeFreeSlots', () => {
  it('returns slots within working hours when no busy intervals', () => {
    const slots = computeFreeSlots(
      [],
      '2026-07-01T08:00:00Z',
      '2026-07-01T12:00:00Z',
      60,
    )
    // Expect slots starting at 09:00 and 10:00 (60-min, end must be <= 17:00)
    expect(slots).toContain('2026-07-01T09:00:00.000Z')
    expect(slots).toContain('2026-07-01T10:00:00.000Z')
    // Should not include 08:00 (before working hours)
    expect(slots).not.toContain('2026-07-01T08:00:00.000Z')
  })

  it('excludes slots overlapping busy intervals', () => {
    const busy = [
      { start: '2026-07-01T09:00:00Z', end: '2026-07-01T10:00:00Z' },
    ]
    const slots = computeFreeSlots(busy, '2026-07-01T08:00:00Z', '2026-07-01T12:00:00Z', 60)
    // 09:00–10:00 is busy, so the 09:00 slot should be excluded
    expect(slots).not.toContain('2026-07-01T09:00:00.000Z')
    // 09:30–10:30 overlaps too
    expect(slots).not.toContain('2026-07-01T09:30:00.000Z')
    // 10:00–11:00 is free
    expect(slots).toContain('2026-07-01T10:00:00.000Z')
  })

  it('respects working hours — no slots before 09:00 UTC', () => {
    const slots = computeFreeSlots([], '2026-07-01T06:00:00Z', '2026-07-01T10:00:00Z', 60)
    for (const slot of slots) {
      const hour = new Date(slot).getUTCHours()
      expect(hour).toBeGreaterThanOrEqual(9)
    }
  })

  it('respects working hours — slot end must be <= 17:00 UTC', () => {
    const slots = computeFreeSlots([], '2026-07-01T15:00:00Z', '2026-07-01T18:00:00Z', 60)
    for (const slot of slots) {
      const endMs = new Date(slot).getTime() + 60 * 60 * 1000
      const endHour = new Date(endMs).getUTCHours()
      expect(endHour).toBeLessThanOrEqual(17)
    }
  })

  it('returns at most 10 slots', () => {
    const slots = computeFreeSlots(
      [],
      '2026-07-01T00:00:00Z',
      '2026-07-05T23:59:00Z',
      30,
    )
    expect(slots.length).toBeLessThanOrEqual(10)
  })

  it('returns empty array when entire window is busy', () => {
    const busy = [
      { start: '2026-07-01T00:00:00Z', end: '2026-07-02T00:00:00Z' },
    ]
    const slots = computeFreeSlots(busy, '2026-07-01T08:00:00Z', '2026-07-01T17:00:00Z', 60)
    expect(slots).toHaveLength(0)
  })

  it('handles multiple busy intervals correctly', () => {
    const busy = [
      { start: '2026-07-01T09:00:00Z', end: '2026-07-01T10:00:00Z' },
      { start: '2026-07-01T11:00:00Z', end: '2026-07-01T12:00:00Z' },
    ]
    const slots = computeFreeSlots(busy, '2026-07-01T08:00:00Z', '2026-07-01T13:00:00Z', 60)
    expect(slots).not.toContain('2026-07-01T09:00:00.000Z')
    expect(slots).not.toContain('2026-07-01T11:00:00.000Z')
    expect(slots).toContain('2026-07-01T10:00:00.000Z')
  })
})
