import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { ApplicationsService } from './applications.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CV_RECEIVED_STAGE = { id: 'stage-cv', key: 'CV_RECEIVED', label: 'CV Received', order: 0, isTerminal: false }

const makeInterviewer = (id: string, name: string) => ({ id, name, email: `${id}@example.com`, role: 'INTERVIEWER' })

const makeFeedback = (interviewId: string, interviewerId: string) => ({
  id: `fb-${interviewId}-${interviewerId}`,
  interviewId,
  interviewerId,
  recommendation: 'HIRE',
  scores: { technical: 4 },
  strengths: 'Good communicator',
  concerns: null,
  notes: null,
  submittedAt: new Date('2026-01-15T10:00:00Z'),
})

const makeInterview = (id: string, appId: string, interviewerIds: string[]) => ({
  id,
  applicationId: appId,
  stageKey: 'TECH_INTERVIEW',
  interviewerIds,
  scheduledAt: new Date('2026-01-15T09:00:00Z'),
  durationMin: 60,
  meetingLink: 'https://meet.example.com/abc',
  icsUid: 'uid-123',
  googleEventId: null,
  status: 'COMPLETED',
  createdAt: new Date('2026-01-10T08:00:00Z'),
  feedback: interviewerIds.map((iid) => makeFeedback(id, iid)),
})

const makeOffer = (appId: string) => ({
  id: 'offer-1',
  applicationId: appId,
  offeredSalary: '100000',
  offerDate: new Date('2026-01-20T00:00:00Z'),
  status: 'ACCEPTED',
  expectedJoiningDate: new Date('2026-02-01T00:00:00Z'),
  confirmedJoiningDate: new Date('2026-02-01T00:00:00Z'),
  noticePeriod: '30 days',
  documentsPending: [],
  joiningRisk: 'LOW',
  notes: null,
  createdAt: new Date('2026-01-20T00:00:00Z'),
})

const makeFullApplication = (appId = 'app1') => ({
  id: appId,
  candidateId: 'cand1',
  roleId: 'role1',
  currentStageId: CV_RECEIVED_STAGE.id,
  currentStage: CV_RECEIVED_STAGE,
  matchScore: 82,
  screeningSummary: '{"strengths":["TypeScript"],"gaps":[],"recommendationCategory":"SHORTLIST"}',
  hrRecommendation: 'Proceed',
  status: 'ACTIVE',
  rejectionReason: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  candidate: {
    id: 'cand1',
    name: 'Alice Smith',
    email: 'alice@example.com',
    phone: '+44123456789',
    address: '12 Example Street, London',
    location: 'London',
    currentCompany: 'Acme',
    currentRole: 'Engineer',
    yearsExperience: 4,
    skills: ['TypeScript', 'Node.js'],
    linkedinUrl: null,
    cvUrl: 'https://storage.example.com/cv/alice.pdf',
  },
  role: {
    id: 'role1',
    title: 'Backend Engineer',
    project: { id: 'proj1', name: 'Phoenix', client: 'BigCorp' },
  },
  transitions: [
    { id: 'tr1', fromStageId: null, toStageId: CV_RECEIVED_STAGE.id, at: new Date('2026-01-01T00:00:00Z'), byUserId: null },
  ],
  interviews: [
    makeInterview('iv1', appId, ['user-1', 'user-2']),
  ],
  offer: makeOffer(appId),
})

const makePrismaForJourney = (appResult: unknown) => ({
  pipelineStage: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
  application: {
    create: vi.fn(),
    findUnique: vi.fn().mockResolvedValue(appResult),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
  },
  stageTransition: { create: vi.fn().mockResolvedValue({}) },
  user: {
    findMany: vi.fn().mockResolvedValue([
      makeInterviewer('user-1', 'Bob Jones'),
      makeInterviewer('user-2', 'Carol White'),
    ]),
  },
  roleReq: { findUnique: vi.fn().mockResolvedValue(null) },
})

const makeScreening = () => ({ score: vi.fn() })

// ── journey ────────────────────────────────────────────────────────────────────

describe('ApplicationsService.journey', () => {
  it('throws NotFoundException when application does not exist', async () => {
    const prisma = makePrismaForJourney(null)
    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    await expect(svc.journey('missing')).rejects.toThrow(NotFoundException)
  })

  it('returns the journey shape with application, candidate, role+project, currentStage, transitions', async () => {
    const fullApp = makeFullApplication()
    const prisma = makePrismaForJourney(fullApp)
    const svc = new ApplicationsService(prisma as never, makeScreening() as never)

    const result = await svc.journey('app1')

    expect(result.application.id).toBe('app1')
    expect(result.candidate.name).toBe('Alice Smith')
    expect(result.candidate.address).toBe('12 Example Street, London')
    expect(result.candidate.cvUrl).toBe('https://storage.example.com/cv/alice.pdf')
    expect(result.role.title).toBe('Backend Engineer')
    expect(result.role.project?.name).toBe('Phoenix')
    expect(result.currentStage?.key).toBe('CV_RECEIVED')
    expect(result.transitions).toHaveLength(1)
  })

  it('resolves interviewer names and attaches them to each interview', async () => {
    const fullApp = makeFullApplication()
    const prisma = makePrismaForJourney(fullApp)
    prisma.user.findMany = vi.fn().mockResolvedValue([
      makeInterviewer('user-1', 'Bob Jones'),
      makeInterviewer('user-2', 'Carol White'),
    ])

    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    const result = await svc.journey('app1')

    expect(result.interviews).toHaveLength(1)
    const interview = result.interviews[0]
    expect(interview.interviewers).toHaveLength(2)
    expect(interview.interviewers.find((i: { id: string }) => i.id === 'user-1')?.name).toBe('Bob Jones')
    expect(interview.interviewers.find((i: { id: string }) => i.id === 'user-2')?.name).toBe('Carol White')
  })

  it('fetches users using the collected interviewerIds across all interviews', async () => {
    const fullApp = makeFullApplication()
    // Override with two interviews, different interviewers
    fullApp.interviews = [
      makeInterview('iv1', 'app1', ['user-1']),
      makeInterview('iv2', 'app1', ['user-2', 'user-3']),
    ]
    const prisma = makePrismaForJourney(fullApp)
    prisma.user.findMany = vi.fn().mockResolvedValue([
      makeInterviewer('user-1', 'Bob'),
      makeInterviewer('user-2', 'Carol'),
      makeInterviewer('user-3', 'Dave'),
    ])

    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    const result = await svc.journey('app1')

    // user.findMany should be called with all unique interviewer IDs
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: expect.arrayContaining(['user-1', 'user-2', 'user-3']) } },
      select: { id: true, name: true, email: true, role: true },
    })

    expect(result.interviews[0].interviewers).toHaveLength(1)
    expect(result.interviews[1].interviewers).toHaveLength(2)
  })

  it('includes feedback nested inside each interview', async () => {
    const fullApp = makeFullApplication()
    const prisma = makePrismaForJourney(fullApp)
    const svc = new ApplicationsService(prisma as never, makeScreening() as never)

    const result = await svc.journey('app1')

    const feedback = result.interviews[0].feedback
    expect(feedback).toHaveLength(2) // one per interviewerId
    expect(feedback[0].recommendation).toBe('HIRE')
  })

  it('includes the offer when present', async () => {
    const fullApp = makeFullApplication()
    const prisma = makePrismaForJourney(fullApp)
    const svc = new ApplicationsService(prisma as never, makeScreening() as never)

    const result = await svc.journey('app1')

    expect(result.offer).not.toBeNull()
    expect(result.offer?.status).toBe('ACCEPTED')
    expect(result.offer?.offeredSalary).toBe('100000')
  })

  it('returns offer as null when no offer exists', async () => {
    const fullApp = makeFullApplication()
    fullApp.offer = null as never
    const prisma = makePrismaForJourney(fullApp)
    const svc = new ApplicationsService(prisma as never, makeScreening() as never)

    const result = await svc.journey('app1')

    expect(result.offer).toBeNull()
  })

  it('handles interviews with no interviewerIds gracefully (empty array)', async () => {
    const fullApp = makeFullApplication()
    fullApp.interviews = [makeInterview('iv1', 'app1', [])]
    const prisma = makePrismaForJourney(fullApp)
    prisma.user.findMany = vi.fn().mockResolvedValue([])

    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    const result = await svc.journey('app1')

    expect(result.interviews[0].interviewers).toHaveLength(0)
  })
})
