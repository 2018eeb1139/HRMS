import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { ApplicationsService } from './applications.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CV_RECEIVED_STAGE = { id: 'stage-cv', key: 'CV_RECEIVED', label: 'CV Received', order: 0, isTerminal: false }
const HR_REVIEW_STAGE   = { id: 'stage-hr', key: 'HR_REVIEW',   label: 'HR Review',   order: 2, isTerminal: false }
const REJECTED_STAGE    = { id: 'stage-rej', key: 'REJECTED',   label: 'Rejected',    order: 11, isTerminal: true }
const WITHDRAWN_STAGE   = { id: 'stage-wd', key: 'WITHDRAWN',   label: 'Withdrawn',   order: 12, isTerminal: true }
const JOINED_STAGE      = { id: 'stage-jn', key: 'JOINED',      label: 'Joined',      order: 10, isTerminal: true }

const makeApplication = (overrides = {}) => ({
  id: 'app1',
  candidateId: 'cand1',
  roleId: 'role1',
  currentStageId: CV_RECEIVED_STAGE.id,
  currentStage: CV_RECEIVED_STAGE,
  matchScore: null,
  screeningSummary: null,
  hrRecommendation: null,
  status: 'ACTIVE' as const,
  rejectionReason: null,
  createdAt: new Date(),
  transitions: [],
  candidate: {
    id: 'cand1',
    name: 'Alice',
    skills: ['TypeScript', 'Node.js'],
    yearsExperience: 4,
    location: 'London',
    cvFiles: [],
  },
  role: {
    id: 'role1',
    title: 'Backend Engineer',
    requiredSkills: ['TypeScript', 'NestJS'],
    preferredSkills: ['PostgreSQL'],
    requiredYearsExperience: 3,
    location: 'London',
    seniority: { id: 'sen1', name: 'Senior', rank: 3 },
  },
  ...overrides,
})

const makePrisma = (overrides: Record<string, unknown> = {}) => ({
  pipelineStage: {
    findUnique: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
  },
  application: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
  },
  stageTransition: {
    create: vi.fn().mockResolvedValue({}),
  },
  ...overrides,
})

const makeScreening = () => ({
  score: vi.fn().mockResolvedValue({
    matchScore: 82,
    skillsMatch: 80,
    experienceMatch: 90,
    seniorityFit: 85,
    industryRelevance: 75,
    locationFit: 100,
    summary: 'Overall match is 82%. Matched 1 of 2 required skills.',
    matchedRequiredSkills: ['TypeScript'],
    missingRequiredSkills: ['NestJS'],
    strengths: ['TypeScript'],
    gaps: ['NestJS experience limited'],
    riskFlags: [],
    suggestedHrQuestions: ['Tell me about your NestJS experience'],
    suggestedInterviewerQuestions: [],
    recommendationCategory: 'SHORTLIST_MINOR_CONCERNS',
  }),
})

// ── create ─────────────────────────────────────────────────────────────────────

describe('ApplicationsService.create', () => {
  it('creates an application at CV_RECEIVED stage and records initial transition', async () => {
    const application = makeApplication()
    const prisma = makePrisma()
    prisma.pipelineStage.findUnique = vi.fn().mockResolvedValue(CV_RECEIVED_STAGE)
    prisma.application.create = vi.fn().mockResolvedValue(application)

    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    const result = await svc.create({ candidateId: 'cand1', roleId: 'role1' })

    expect(prisma.application.create).toHaveBeenCalledWith({
      data: { candidateId: 'cand1', roleId: 'role1', currentStageId: CV_RECEIVED_STAGE.id },
    })
    expect(prisma.stageTransition.create).toHaveBeenCalledWith({
      data: {
        applicationId: 'app1',
        fromStageId: null,
        toStageId: CV_RECEIVED_STAGE.id,
      },
    })
    expect(result.id).toBe('app1')
  })

  it('throws BadRequestException when CV_RECEIVED stage is missing', async () => {
    const prisma = makePrisma()
    prisma.pipelineStage.findUnique = vi.fn().mockResolvedValue(null)

    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    await expect(svc.create({ candidateId: 'cand1', roleId: 'role1' }))
      .rejects.toThrow(BadRequestException)
  })

  it('throws ConflictException on Prisma P2002 (duplicate application)', async () => {
    const prisma = makePrisma()
    prisma.pipelineStage.findUnique = vi.fn().mockResolvedValue(CV_RECEIVED_STAGE)
    prisma.application.create = vi.fn().mockRejectedValue({ code: 'P2002' })

    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    await expect(svc.create({ candidateId: 'cand1', roleId: 'role1' }))
      .rejects.toThrow(ConflictException)
  })
})

// ── getById ────────────────────────────────────────────────────────────────────

describe('ApplicationsService.getById', () => {
  it('returns application with includes when found', async () => {
    const application = makeApplication()
    const prisma = makePrisma()
    prisma.application.findUnique = vi.fn().mockResolvedValue(application)

    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    const result = await svc.getById('app1')
    expect(result.id).toBe('app1')
    expect(prisma.application.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'app1' } }),
    )
  })

  it('throws NotFoundException when application does not exist', async () => {
    const prisma = makePrisma()
    prisma.application.findUnique = vi.fn().mockResolvedValue(null)

    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    await expect(svc.getById('missing')).rejects.toThrow(NotFoundException)
  })
})

// ── moveStage ──────────────────────────────────────────────────────────────────

describe('ApplicationsService.moveStage', () => {
  it('throws NotFoundException when application does not exist', async () => {
    const prisma = makePrisma()
    prisma.application.findUnique = vi.fn().mockResolvedValue(null)

    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    await expect(svc.moveStage('missing', 'HR_REVIEW')).rejects.toThrow(NotFoundException)
  })

  it('throws BadRequestException for unknown stage key', async () => {
    const application = makeApplication()
    const prisma = makePrisma()
    prisma.application.findUnique = vi.fn().mockResolvedValue(application)
    prisma.pipelineStage.findUnique = vi.fn().mockResolvedValue(null)

    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    await expect(svc.moveStage('app1', 'NONEXISTENT_STAGE')).rejects.toThrow(BadRequestException)
  })

  it('updates currentStageId and records a transition', async () => {
    const application = makeApplication()
    const updated = makeApplication({ currentStage: HR_REVIEW_STAGE, currentStageId: HR_REVIEW_STAGE.id })
    const prisma = makePrisma()
    prisma.application.findUnique = vi.fn().mockResolvedValue(application)
    prisma.pipelineStage.findUnique = vi.fn().mockResolvedValue(HR_REVIEW_STAGE)
    prisma.application.update = vi.fn().mockResolvedValue(updated)

    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    const result = await svc.moveStage('app1', 'HR_REVIEW', 'user-hr-1')

    expect(prisma.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'app1' },
        data: expect.objectContaining({ currentStageId: HR_REVIEW_STAGE.id }),
      }),
    )
    expect(prisma.stageTransition.create).toHaveBeenCalledWith({
      data: {
        applicationId: 'app1',
        fromStageId: CV_RECEIVED_STAGE.id,
        toStageId: HR_REVIEW_STAGE.id,
        byUserId: 'user-hr-1',
      },
    })
    expect(result.currentStage?.key).toBe('HR_REVIEW')
  })

  it('sets status to HIRED when moving to JOINED (terminal)', async () => {
    const application = makeApplication()
    const updated = makeApplication({ currentStage: JOINED_STAGE, status: 'HIRED' })
    const prisma = makePrisma()
    prisma.application.findUnique = vi.fn().mockResolvedValue(application)
    prisma.pipelineStage.findUnique = vi.fn().mockResolvedValue(JOINED_STAGE)
    prisma.application.update = vi.fn().mockResolvedValue(updated)

    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    const result = await svc.moveStage('app1', 'JOINED')

    expect(prisma.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'HIRED' }),
      }),
    )
    expect(result.status).toBe('HIRED')
  })

  it('sets status to REJECTED when moving to REJECTED (terminal)', async () => {
    const application = makeApplication()
    const updated = makeApplication({ currentStage: REJECTED_STAGE, status: 'REJECTED' })
    const prisma = makePrisma()
    prisma.application.findUnique = vi.fn().mockResolvedValue(application)
    prisma.pipelineStage.findUnique = vi.fn().mockResolvedValue(REJECTED_STAGE)
    prisma.application.update = vi.fn().mockResolvedValue(updated)

    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    const result = await svc.moveStage('app1', 'REJECTED')

    expect(result.status).toBe('REJECTED')
  })

  it('sets status to WITHDRAWN when moving to WITHDRAWN (terminal)', async () => {
    const application = makeApplication()
    const updated = makeApplication({ currentStage: WITHDRAWN_STAGE, status: 'WITHDRAWN' })
    const prisma = makePrisma()
    prisma.application.findUnique = vi.fn().mockResolvedValue(application)
    prisma.pipelineStage.findUnique = vi.fn().mockResolvedValue(WITHDRAWN_STAGE)
    prisma.application.update = vi.fn().mockResolvedValue(updated)

    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    const result = await svc.moveStage('app1', 'WITHDRAWN')

    expect(result.status).toBe('WITHDRAWN')
  })
})

// ── reject ─────────────────────────────────────────────────────────────────────

describe('ApplicationsService.reject', () => {
  it('throws NotFoundException when application does not exist', async () => {
    const prisma = makePrisma()
    prisma.application.findUnique = vi.fn().mockResolvedValue(null)

    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    await expect(svc.reject('missing', 'Not a fit')).rejects.toThrow(NotFoundException)
  })

  it('sets status REJECTED and stores rejectionReason', async () => {
    const application = makeApplication()
    const rejected = makeApplication({ status: 'REJECTED', rejectionReason: 'Not a fit', currentStage: REJECTED_STAGE })
    const prisma = makePrisma()
    prisma.application.findUnique = vi.fn()
      .mockResolvedValueOnce(application)          // first call in reject()
      .mockResolvedValueOnce({ ...rejected, transitions: [] }) // getById()
    prisma.pipelineStage.findUnique = vi.fn().mockResolvedValue(REJECTED_STAGE)
    prisma.application.update = vi.fn().mockResolvedValue(rejected)

    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    const result = await svc.reject('app1', 'Not a fit', 'user-hr')

    expect(prisma.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'app1' },
        data: expect.objectContaining({ status: 'REJECTED', rejectionReason: 'Not a fit' }),
      }),
    )
    expect(prisma.stageTransition.create).toHaveBeenCalled()
    expect(result.status).toBe('REJECTED')
  })
})

// ── runScreening ───────────────────────────────────────────────────────────────

describe('ApplicationsService.runScreening', () => {
  it('throws NotFoundException when application does not exist', async () => {
    const prisma = makePrisma()
    prisma.application.findUnique = vi.fn().mockResolvedValue(null)

    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    await expect(svc.runScreening('missing')).rejects.toThrow(NotFoundException)
  })

  it('allows screening when no CV is uploaded', async () => {
    const application = makeApplication()
    const screening = makeScreening()
    const prisma = makePrisma()
    prisma.application.findUnique = vi.fn().mockResolvedValue(application)
    prisma.application.update = vi.fn().mockResolvedValue(application)

    const svc = new ApplicationsService(prisma as never, screening as never)
    await svc.runScreening('app1')

    expect(screening.score).toHaveBeenCalled()
  })

  it('screens using candidate fields enriched from a parsed CV', async () => {
    const application = makeApplication({
      candidate: {
        ...makeApplication().candidate,
        skills: ['Python', 'PostgreSQL'],
        yearsExperience: 7,
        cvFiles: [{
          status: 'PARSED',
          parsedJson: {
            skills: ['Python', 'PostgreSQL'],
            totalYearsExperience: 7,
          },
        }],
      },
    })
    const screening = makeScreening()
    const prisma = makePrisma()
    prisma.application.findUnique = vi.fn().mockResolvedValue(application)
    prisma.application.update = vi.fn().mockResolvedValue(application)

    const svc = new ApplicationsService(prisma as never, screening as never)
    const result = await svc.runScreening('app1')

    expect(screening.score).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: expect.objectContaining({
          skills: ['Python', 'PostgreSQL'],
          yearsExperience: 7,
        }),
      }),
    )
    expect(result.summary).toContain('82%')
    expect(prisma.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          matchScore: 82,
          screeningSummary: result.summary,
        }),
      }),
    )
  })

  it.each([
    ['UPLOADED', null, /still being processed/i],
    ['PARSING', null, /still being processed/i],
    ['FAILED', null, /parsing failed/i],
    ['PARSED', null, /profile data is unavailable/i],
  ])('blocks screening for latest CV status %s without structured data', async (status, parsedJson, message) => {
    const application = makeApplication({
      candidate: {
        ...makeApplication().candidate,
        cvFiles: [{ status, parsedJson }],
      },
    })
    const screening = makeScreening()
    const prisma = makePrisma()
    prisma.application.findUnique = vi.fn().mockResolvedValue(application)

    const svc = new ApplicationsService(prisma as never, screening as never)
    await expect(svc.runScreening('app1')).rejects.toThrow(message)
    expect(screening.score).not.toHaveBeenCalled()
  })

  it('builds ScreeningInput from candidate + role, calls SCREENING.score, stores matchScore + summary', async () => {
    const application = makeApplication({
      candidate: {
        ...makeApplication().candidate,
        cvFiles: [{ status: 'PARSED', parsedJson: { skills: ['TypeScript'] } }],
      },
    })
    const screening = makeScreening()
    const prisma = makePrisma()
    prisma.application.findUnique = vi.fn().mockResolvedValue(application)
    prisma.application.update = vi.fn().mockResolvedValue(application)

    const svc = new ApplicationsService(prisma as never, screening as never)
    const result = await svc.runScreening('app1')

    expect(screening.score).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: expect.objectContaining({
          skills: ['TypeScript', 'Node.js'],
          yearsExperience: 4,
          location: 'London',
        }),
        role: expect.objectContaining({
          requiredSkills: ['TypeScript', 'NestJS'],
          preferredSkills: ['PostgreSQL'],
          requiredYearsExperience: 3,
          seniority: 'Senior',
          location: 'London',
        }),
      }),
    )
    expect(prisma.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          matchScore: 82,
          screeningSummary: 'Overall match is 82%. Matched 1 of 2 required skills.',
        }),
      }),
    )
    expect(result.matchScore).toBe(82)
    expect(result.summary).toContain('Matched 1 of 2 required skills')
    expect(result.recommendationCategory).toBe('SHORTLIST_MINOR_CONCERNS')
  })
})

// ── pipelineForRole ────────────────────────────────────────────────────────────

describe('ApplicationsService.pipelineForRole', () => {
  it('groups applications into columns by stage key', async () => {
    const stages = [CV_RECEIVED_STAGE, HR_REVIEW_STAGE, REJECTED_STAGE]
    const apps = [
      makeApplication({ id: 'a1', currentStage: CV_RECEIVED_STAGE }),
      makeApplication({ id: 'a2', currentStage: CV_RECEIVED_STAGE }),
      makeApplication({ id: 'a3', currentStage: HR_REVIEW_STAGE }),
    ]
    const prisma = makePrisma()
    prisma.pipelineStage.findMany = vi.fn().mockResolvedValue(stages)
    prisma.application.findMany = vi.fn().mockResolvedValue(apps)

    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    const result = await svc.pipelineForRole('role1')

    expect(result.stages).toHaveLength(3)
    expect(result.columns['CV_RECEIVED']).toHaveLength(2)
    expect(result.columns['HR_REVIEW']).toHaveLength(1)
    expect(result.columns['REJECTED']).toHaveLength(0)
  })

  it('returns empty columns when no applications exist', async () => {
    const stages = [CV_RECEIVED_STAGE]
    const prisma = makePrisma()
    prisma.pipelineStage.findMany = vi.fn().mockResolvedValue(stages)
    prisma.application.findMany = vi.fn().mockResolvedValue([])

    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    const result = await svc.pipelineForRole('role1')

    expect(result.columns['CV_RECEIVED']).toHaveLength(0)
  })
})

// ── bulkMove ───────────────────────────────────────────────────────────────────

describe('ApplicationsService.bulkMove', () => {
  it('moves all valid applications and returns count', async () => {
    const application = makeApplication()
    const updated = makeApplication({ currentStage: HR_REVIEW_STAGE })
    const prisma = makePrisma()
    prisma.application.findUnique = vi.fn().mockResolvedValue(application)
    prisma.pipelineStage.findUnique = vi.fn().mockResolvedValue(HR_REVIEW_STAGE)
    prisma.application.update = vi.fn().mockResolvedValue(updated)

    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    const result = await svc.bulkMove(['app1', 'app2'], 'HR_REVIEW')

    expect(result.count).toBe(2)
  })

  it('skips not-found applications and returns partial count', async () => {
    const application = makeApplication()
    const updated = makeApplication({ currentStage: HR_REVIEW_STAGE })
    const prisma = makePrisma()
    // Only the second call returns an application; first returns null
    prisma.application.findUnique = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(application)
    prisma.pipelineStage.findUnique = vi.fn().mockResolvedValue(HR_REVIEW_STAGE)
    prisma.application.update = vi.fn().mockResolvedValue(updated)

    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    const result = await svc.bulkMove(['missing', 'app1'], 'HR_REVIEW')

    expect(result.count).toBe(1)
  })
})
