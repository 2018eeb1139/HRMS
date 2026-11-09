import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DashboardsService } from './dashboards.service'

// ── Prisma mock factory ───────────────────────────────────────────────────────

const makePrisma = () => ({
  roleReq: { findMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  offer: { count: vi.fn().mockResolvedValue(0) },
  cvFile: { count: vi.fn().mockResolvedValue(0) },
  pipelineStage: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) },
  application: {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    groupBy: vi.fn().mockResolvedValue([]),
  },
  interview: { count: vi.fn().mockResolvedValue(0) },
  communicationLog: { count: vi.fn().mockResolvedValue(0) },
  project: { findMany: vi.fn().mockResolvedValue([]) },
})

const makeProjectsService = () => ({
  staffingSummary: vi.fn().mockResolvedValue({
    requiredHeadcount: 4,
    filledHeadcount: 2,
    gap: 2,
    openRoles: 1,
    riskLevel: 'MEDIUM',
  }),
})

const makeOffersService = () => ({
  joiningTracker: vi.fn().mockResolvedValue([]),
})

const makeFeedbackService = () => ({
  tracking: vi.fn().mockResolvedValue({ submitted: 5, pending: 2, delayed: 0, conflicting: [] }),
})

const makeService = (prismaOverrides = {}) => {
  const prisma = { ...makePrisma(), ...prismaOverrides }
  const projectsService = makeProjectsService()
  const offersService = makeOffersService()
  const feedbackService = makeFeedbackService()
  const svc = new DashboardsService(
    prisma as never,
    projectsService as never,
    offersService as never,
    feedbackService as never,
  )
  return { svc, prisma, projectsService, offersService, feedbackService }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeRole = (overrides = {}) => ({
  id: 'role1',
  title: 'Backend Engineer',
  requiredCount: 3,
  filledCount: 1,
  status: 'OPEN',
  priority: 'HIGH',
  targetClosureDate: null,
  targetJoiningDate: null,
  createdAt: new Date('2026-01-01'),
  ...overrides,
})

// ── executive ─────────────────────────────────────────────────────────────────

describe('DashboardsService.executive', () => {
  it('assembles headcount totals from roles', async () => {
    const roles = [
      makeRole({ requiredCount: 3, filledCount: 1, status: 'OPEN' }),
      makeRole({ id: 'role2', requiredCount: 2, filledCount: 2, status: 'FILLED', priority: 'LOW' }),
    ]
    const { svc, prisma } = makeService()
    prisma.roleReq.findMany.mockResolvedValue(roles)

    const result = await svc.executive()

    expect(result.requiredPositions).toBe(5)
    expect(result.filledPositions).toBe(3)
    expect(result.gap).toBe(2)
    expect(result.openRoles).toBe(1)
  })

  it('includes highPriorityRoles with HIGH and CRITICAL priority', async () => {
    const roles = [
      makeRole({ id: 'r1', priority: 'HIGH', status: 'OPEN' }),
      makeRole({ id: 'r2', priority: 'CRITICAL', status: 'IN_PROGRESS' }),
      makeRole({ id: 'r3', priority: 'LOW', status: 'OPEN' }),
    ]
    const { svc, prisma } = makeService()
    prisma.roleReq.findMany.mockResolvedValue(roles)

    const result = await svc.executive()

    expect(result.highPriorityRoles).toHaveLength(2)
    expect(result.highPriorityRoles.map((r: { roleId: string }) => r.roleId)).toContain('r1')
    expect(result.highPriorityRoles.map((r: { roleId: string }) => r.roleId)).toContain('r2')
  })

  it('excludes CANCELLED and CLOSED from highPriorityRoles', async () => {
    const roles = [
      makeRole({ id: 'r1', priority: 'HIGH', status: 'CANCELLED' }),
      makeRole({ id: 'r2', priority: 'CRITICAL', status: 'CLOSED' }),
    ]
    const { svc, prisma } = makeService()
    prisma.roleReq.findMany.mockResolvedValue(roles)

    const result = await svc.executive()

    expect(result.highPriorityRoles).toHaveLength(0)
  })

  it('flags delayedRoles with past targetClosureDate and gap > 0', async () => {
    const pastDate = new Date('2026-01-01')
    const roles = [
      makeRole({ id: 'r1', requiredCount: 2, filledCount: 0, status: 'OPEN', targetClosureDate: pastDate }),
    ]
    const { svc, prisma } = makeService()
    prisma.roleReq.findMany.mockResolvedValue(roles)

    const result = await svc.executive()

    expect(result.delayedRoles).toHaveLength(1)
    expect(result.delayedRoles[0].roleId).toBe('r1')
  })

  it('includes offersInProgress count from prisma', async () => {
    const { svc, prisma } = makeService()
    prisma.roleReq.findMany.mockResolvedValue([])
    prisma.offer.count.mockResolvedValue(7)

    const result = await svc.executive()

    expect(result.offersInProgress).toBe(7)
  })

  it('includes upcomingJoiners from joiningTracker', async () => {
    const { svc, prisma, offersService } = makeService()
    prisma.roleReq.findMany.mockResolvedValue([])
    offersService.joiningTracker.mockResolvedValue([
      { offerId: 'o1' },
      { offerId: 'o2' },
      { offerId: 'o3' },
    ])

    const result = await svc.executive()

    expect(result.upcomingJoiners).toBe(3)
  })

  it('includes projectStaffingRisks per project', async () => {
    const { svc, prisma, projectsService } = makeService()
    prisma.roleReq.findMany.mockResolvedValue([])
    prisma.project.findMany.mockResolvedValue([
      { id: 'p1', name: 'Alpha' },
      { id: 'p2', name: 'Beta' },
    ])
    projectsService.staffingSummary.mockResolvedValue({
      requiredHeadcount: 3,
      filledHeadcount: 1,
      gap: 2,
      openRoles: 1,
      riskLevel: 'HIGH',
    })

    const result = await svc.executive()

    expect(result.projectStaffingRisks).toHaveLength(2)
    expect(result.projectStaffingRisks[0].projectName).toBe('Alpha')
    expect(result.projectStaffingRisks[0].riskLevel).toBe('HIGH')
  })
})

// ── roleLevel ─────────────────────────────────────────────────────────────────

describe('DashboardsService.roleLevel', () => {
  it('computes remainingCount as required - filled', async () => {
    const role = makeRole({ id: 'role1', requiredCount: 4, filledCount: 1 })
    const { svc, prisma } = makeService()
    prisma.roleReq.findUniqueOrThrow.mockResolvedValue(role)
    prisma.application.findMany.mockResolvedValue([])

    const result = await svc.roleLevel('role1')

    expect(result.remainingCount).toBe(3)
    expect(result.requiredCount).toBe(4)
    expect(result.filledCount).toBe(1)
  })

  it('remainingCount is 0 when filled >= required', async () => {
    const role = makeRole({ requiredCount: 2, filledCount: 2 })
    const { svc, prisma } = makeService()
    prisma.roleReq.findUniqueOrThrow.mockResolvedValue(role)
    prisma.application.findMany.mockResolvedValue([])

    const result = await svc.roleLevel('role1')

    expect(result.remainingCount).toBe(0)
  })

  it('counts aiStrongMatches from applications with matchScore >= 75', async () => {
    const role = makeRole({ requiredCount: 3, filledCount: 0 })
    const apps = [
      { id: 'a1', matchScore: 80, currentStage: null, offer: null, interviews: [] },
      { id: 'a2', matchScore: 70, currentStage: null, offer: null, interviews: [] },
      { id: 'a3', matchScore: 75, currentStage: null, offer: null, interviews: [] },
      { id: 'a4', matchScore: null, currentStage: null, offer: null, interviews: [] },
    ]
    const { svc, prisma } = makeService()
    prisma.roleReq.findUniqueOrThrow.mockResolvedValue(role)
    prisma.application.findMany.mockResolvedValue(apps)

    const result = await svc.roleLevel('role1')

    // matchScore 80 and 75 qualify (>= 75), 70 and null do not
    expect(result.aiStrongMatches).toBe(2)
  })

  it('computes daysOpen from role.createdAt', async () => {
    const createdAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    const role = makeRole({ createdAt })
    const { svc, prisma } = makeService()
    prisma.roleReq.findUniqueOrThrow.mockResolvedValue(role)
    prisma.application.findMany.mockResolvedValue([])

    const result = await svc.roleLevel('role1')

    expect(result.daysOpen).toBeGreaterThanOrEqual(4)
    expect(result.daysOpen).toBeLessThanOrEqual(6)
  })

  it('includes risk computed by roleRisk helper', async () => {
    const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const role = makeRole({ requiredCount: 2, filledCount: 0, targetClosureDate: pastDate })
    const { svc, prisma } = makeService()
    prisma.roleReq.findUniqueOrThrow.mockResolvedValue(role)
    prisma.application.findMany.mockResolvedValue([])

    const result = await svc.roleLevel('role1')

    expect(result.risk).toBe('HIGH')
  })
})
