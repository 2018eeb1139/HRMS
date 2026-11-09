import { describe, it, expect, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { ProjectsService } from './projects.service'

const makeProject = (overrides = {}) => ({
  id: 'proj1',
  name: 'Alpha',
  client: null,
  projectManagerId: null,
  startDate: null,
  endDate: null,
  status: 'PLANNED',
  createdAt: new Date(),
  roles: [],
  ...overrides,
})

const makeRole = (overrides = {}) => ({
  id: 'role1',
  requiredCount: 2,
  filledCount: 0,
  status: 'OPEN',
  priority: 'MEDIUM',
  ...overrides,
})

describe('ProjectsService', () => {
  describe('getById', () => {
    it('returns the project when found', async () => {
      const project = makeProject()
      const prisma = { project: { findUnique: vi.fn().mockResolvedValue(project) } }
      const svc = new ProjectsService(prisma as never)
      expect(await svc.getById('proj1')).toEqual(project)
    })

    it('throws NotFoundException when project does not exist', async () => {
      const prisma = { project: { findUnique: vi.fn().mockResolvedValue(null) } }
      const svc = new ProjectsService(prisma as never)
      await expect(svc.getById('missing')).rejects.toThrow(NotFoundException)
    })
  })

  describe('list', () => {
    it('uses default take 50 and orders by createdAt desc', async () => {
      const prisma = { project: { findMany: vi.fn().mockResolvedValue([]) } }
      const svc = new ProjectsService(prisma as never)
      await svc.list({})
      expect(prisma.project.findMany).toHaveBeenCalledWith({
        skip: undefined,
        take: 50,
        orderBy: { createdAt: 'desc' },
      })
    })

    it('forwards custom skip/take', async () => {
      const prisma = { project: { findMany: vi.fn().mockResolvedValue([]) } }
      const svc = new ProjectsService(prisma as never)
      await svc.list({ skip: 10, take: 20 })
      expect(prisma.project.findMany).toHaveBeenCalledWith({
        skip: 10,
        take: 20,
        orderBy: { createdAt: 'desc' },
      })
    })
  })

  describe('staffingSummary', () => {
    it('returns all zeros and LOW risk when no roles exist', async () => {
      const project = makeProject({ roles: [] })
      const prisma = { project: { findUnique: vi.fn().mockResolvedValue(project) } }
      const svc = new ProjectsService(prisma as never)
      const summary = await svc.staffingSummary('proj1')
      expect(summary).toEqual({
        requiredHeadcount: 0,
        filledHeadcount: 0,
        gap: 0,
        openRoles: 0,
        riskLevel: 'LOW',
      })
    })

    it('computes gap and riskLevel=LOW when gap<=0', async () => {
      const project = makeProject({
        roles: [
          makeRole({ requiredCount: 2, filledCount: 2, status: 'FILLED' }),
          makeRole({ id: 'role2', requiredCount: 1, filledCount: 1, status: 'FILLED' }),
        ],
      })
      const prisma = { project: { findUnique: vi.fn().mockResolvedValue(project) } }
      const svc = new ProjectsService(prisma as never)
      const summary = await svc.staffingSummary('proj1')
      expect(summary.gap).toBe(0)
      expect(summary.riskLevel).toBe('LOW')
    })

    it('computes riskLevel=MEDIUM when gap is 1 or 2', async () => {
      const project = makeProject({
        roles: [makeRole({ requiredCount: 3, filledCount: 1, status: 'OPEN' })],
      })
      const prisma = { project: { findUnique: vi.fn().mockResolvedValue(project) } }
      const svc = new ProjectsService(prisma as never)
      const summary = await svc.staffingSummary('proj1')
      expect(summary.gap).toBe(2)
      expect(summary.riskLevel).toBe('MEDIUM')
    })

    it('computes riskLevel=HIGH when gap>2', async () => {
      const project = makeProject({
        roles: [
          makeRole({ requiredCount: 4, filledCount: 0, status: 'OPEN' }),
          makeRole({ id: 'role2', requiredCount: 2, filledCount: 2, status: 'FILLED' }),
        ],
      })
      const prisma = { project: { findUnique: vi.fn().mockResolvedValue(project) } }
      const svc = new ProjectsService(prisma as never)
      const summary = await svc.staffingSummary('proj1')
      expect(summary.gap).toBe(4)
      expect(summary.riskLevel).toBe('HIGH')
    })

    it('excludes CANCELLED and CLOSED roles from gap calculation', async () => {
      const project = makeProject({
        roles: [
          makeRole({ requiredCount: 5, filledCount: 0, status: 'CANCELLED' }),
          makeRole({ id: 'role2', requiredCount: 3, filledCount: 0, status: 'CLOSED' }),
          makeRole({ id: 'role3', requiredCount: 2, filledCount: 1, status: 'OPEN' }),
        ],
      })
      const prisma = { project: { findUnique: vi.fn().mockResolvedValue(project) } }
      const svc = new ProjectsService(prisma as never)
      const summary = await svc.staffingSummary('proj1')
      // Only the OPEN role counts: required=2, filled=1, gap=1
      expect(summary.requiredHeadcount).toBe(2)
      expect(summary.filledHeadcount).toBe(1)
      expect(summary.gap).toBe(1)
      expect(summary.riskLevel).toBe('MEDIUM')
    })

    it('counts openRoles correctly', async () => {
      const project = makeProject({
        roles: [
          makeRole({ status: 'OPEN' }),
          makeRole({ id: 'role2', status: 'IN_PROGRESS' }),
          makeRole({ id: 'role3', status: 'FILLED' }),
          makeRole({ id: 'role4', status: 'CLOSED' }),
        ],
      })
      const prisma = { project: { findUnique: vi.fn().mockResolvedValue(project) } }
      const svc = new ProjectsService(prisma as never)
      const summary = await svc.staffingSummary('proj1')
      expect(summary.openRoles).toBe(2) // OPEN + IN_PROGRESS
    })

    it('throws NotFoundException when project does not exist', async () => {
      const prisma = { project: { findUnique: vi.fn().mockResolvedValue(null) } }
      const svc = new ProjectsService(prisma as never)
      await expect(svc.staffingSummary('missing')).rejects.toThrow(NotFoundException)
    })
  })
})
