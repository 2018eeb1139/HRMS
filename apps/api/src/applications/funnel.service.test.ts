import { describe, it, expect, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { ApplicationsService } from './applications.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CV_RECEIVED_STAGE = { id: 'stage-cv', key: 'CV_RECEIVED', label: 'CV Received', order: 0, isTerminal: false }
const HR_REVIEW_STAGE   = { id: 'stage-hr', key: 'HR_REVIEW',   label: 'HR Review',   order: 2, isTerminal: false }
const SELECTED_STAGE    = { id: 'stage-sel', key: 'SELECTED',   label: 'Selected',    order: 8, isTerminal: false }

const makeApp = (stage: typeof CV_RECEIVED_STAGE, status = 'ACTIVE') => ({
  id: `app-${Math.random()}`,
  status,
  currentStage: stage,
  matchScore: null,
  interviews: [],
  offer: null,
})

const makePrisma = (roleResult: unknown, apps: unknown[]) => ({
  pipelineStage: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
  application: {
    create: vi.fn(),
    findUnique: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue(apps),
    update: vi.fn(),
  },
  stageTransition: { create: vi.fn().mockResolvedValue({}) },
  user: { findMany: vi.fn().mockResolvedValue([]) },
  roleReq: { findUnique: vi.fn().mockResolvedValue(roleResult) },
})

const makeScreening = () => ({ score: vi.fn() })

const ROLE = { id: 'role1', title: 'Backend Engineer' }

// ── funnel ─────────────────────────────────────────────────────────────────────

describe('ApplicationsService.funnel', () => {
  it('throws NotFoundException when role does not exist', async () => {
    const prisma = makePrisma(null, [])
    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    await expect(svc.funnel('missing-role')).rejects.toThrow(NotFoundException)
  })

  it('returns all-zero funnel for a role with no applications', async () => {
    const prisma = makePrisma(ROLE, [])
    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    const result = await svc.funnel('role1')

    expect(result.roleId).toBe('role1')
    expect(result.peopleAdded).toBe(0)
    expect(result.cvReviewed).toBe(0)
    expect(result.selected).toBe(0)
  })

  it('returns correct funnel buckets for mixed applications', async () => {
    const apps = [
      makeApp(CV_RECEIVED_STAGE),
      { ...makeApp(HR_REVIEW_STAGE), matchScore: 75 },
      {
        ...makeApp(SELECTED_STAGE),
        matchScore: 82,
        interviews: [
          { stageKey: 'TECH_INTERVIEW', status: 'COMPLETED', feedback: [{ recommendation: 'HIRE' }] },
          { stageKey: 'HM_INTERVIEW', status: 'COMPLETED', feedback: [{ recommendation: 'STRONG_HIRE' }] },
        ],
        offer: { status: 'SENT' },
      },
      { ...makeApp(HR_REVIEW_STAGE, 'REJECTED'), matchScore: 70 },
      makeApp(CV_RECEIVED_STAGE, 'WITHDRAWN'),
    ]
    const prisma = makePrisma(ROLE, apps)
    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    const result = await svc.funnel('role1')

    expect(result.roleId).toBe('role1')
    expect(result.peopleAdded).toBe(5)
    expect(result.cvReviewed).toBe(5)
    expect(result.screened).toBe(3)
    expect(result.firstInterview).toBe(1)
    expect(result.secondInterview).toBe(1)
    expect(result.selected).toBe(1)
    expect(result.offer).toBe(1)
    expect(result.rejected).toBe(1)
    expect(result.withdrawn).toBe(1)
  })

  it('queries applications with currentStage included', async () => {
    const prisma = makePrisma(ROLE, [])
    const svc = new ApplicationsService(prisma as never, makeScreening() as never)
    await svc.funnel('role1')

    expect(prisma.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { roleId: 'role1' },
        include: expect.objectContaining({
          currentStage: true,
          interviews: expect.any(Object),
          offer: { select: { status: true } },
        }),
      }),
    )
  })
})
