import { describe, it, expect, vi } from 'vitest'
import { NotFoundException, BadRequestException } from '@nestjs/common'
import { RolesService } from './roles.service'

const makeRole = (overrides = {}) => ({
  id: 'role1',
  projectId: null,
  title: 'Backend Engineer',
  departmentId: null,
  seniorityId: null,
  requiredCount: 3,
  filledCount: 1,
  location: null,
  employmentType: null,
  jobDescription: null,
  responsibilities: null,
  requiredSkills: [],
  preferredSkills: [],
  requiredYearsExperience: null,
  education: null,
  certifications: null,
  languages: [],
  salaryRange: null,
  priority: 'MEDIUM',
  status: 'OPEN',
  hiringManagerId: null,
  hrOwnerId: null,
  targetJoiningDate: null,
  targetClosureDate: null,
  closureReason: null,
  closureNotes: null,
  closedAt: null,
  createdAt: new Date(),
  ...overrides,
})

describe('RolesService', () => {
  describe('getById', () => {
    it('returns role with remainingCount derived', async () => {
      const role = makeRole({ requiredCount: 3, filledCount: 1 })
      const prisma = { roleReq: { findUnique: vi.fn().mockResolvedValue(role) } }
      const svc = new RolesService(prisma as never)
      const result = await svc.getById('role1')
      expect(result.remainingCount).toBe(2)
    })

    it('remainingCount is 0 when filled equals required', async () => {
      const role = makeRole({ requiredCount: 2, filledCount: 2 })
      const prisma = { roleReq: { findUnique: vi.fn().mockResolvedValue(role) } }
      const svc = new RolesService(prisma as never)
      const result = await svc.getById('role1')
      expect(result.remainingCount).toBe(0)
    })

    it('throws NotFoundException when role does not exist', async () => {
      const prisma = { roleReq: { findUnique: vi.fn().mockResolvedValue(null) } }
      const svc = new RolesService(prisma as never)
      await expect(svc.getById('missing')).rejects.toThrow(NotFoundException)
    })
  })

  describe('delete', () => {
    it('deletes an existing role', async () => {
      const role = makeRole()
      const prisma = {
        roleReq: {
          findUnique: vi.fn().mockResolvedValue(role),
          delete: vi.fn().mockResolvedValue(role),
        },
      }
      const svc = new RolesService(prisma as never)

      await expect(svc.delete('role1')).resolves.toEqual(role)
      expect(prisma.roleReq.delete).toHaveBeenCalledWith({
        where: { id: 'role1' },
      })
    })

    it('does not delete a missing role', async () => {
      const prisma = {
        roleReq: {
          findUnique: vi.fn().mockResolvedValue(null),
          delete: vi.fn(),
        },
      }
      const svc = new RolesService(prisma as never)

      await expect(svc.delete('missing')).rejects.toThrow(NotFoundException)
      expect(prisma.roleReq.delete).not.toHaveBeenCalled()
    })
  })

  describe('close', () => {
    it('throws BadRequestException when closing an unfilled role without a reason', async () => {
      const role = makeRole({ status: 'OPEN', filledCount: 0, requiredCount: 3 })
      const prisma = { roleReq: { findUnique: vi.fn().mockResolvedValue(role), update: vi.fn() } }
      const svc = new RolesService(prisma as never)
      // Empty reason should be caught by Zod before service — but service also guards
      await expect(svc.close('role1', { reason: '', notes: undefined })).rejects.toThrow(BadRequestException)
    })

    it('succeeds closing an unfilled role when a non-empty reason is provided', async () => {
      const role = makeRole({ status: 'OPEN', filledCount: 1, requiredCount: 3 })
      const updated = { ...role, status: 'CLOSED', closureReason: 'Budget cut', closedAt: new Date() }
      const prisma = {
        roleReq: {
          findUnique: vi.fn().mockResolvedValue(role),
          update: vi.fn().mockResolvedValue(updated),
        },
      }
      const svc = new RolesService(prisma as never)
      const result = await svc.close('role1', { reason: 'Budget cut' })
      expect(result.status).toBe('CLOSED')
      expect(result.closureReason).toBe('Budget cut')
      expect(prisma.roleReq.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'role1' },
          data: expect.objectContaining({ status: 'CLOSED', closureReason: 'Budget cut' }),
        }),
      )
    })

    it('succeeds closing a FILLED role (filled>=required) without separate reason check', async () => {
      const role = makeRole({ status: 'FILLED', filledCount: 3, requiredCount: 3 })
      const updated = { ...role, status: 'CLOSED', closureReason: 'All filled', closedAt: new Date() }
      const prisma = {
        roleReq: {
          findUnique: vi.fn().mockResolvedValue(role),
          update: vi.fn().mockResolvedValue(updated),
        },
      }
      const svc = new RolesService(prisma as never)
      const result = await svc.close('role1', { reason: 'All filled' })
      expect(result.status).toBe('CLOSED')
    })

    it('succeeds closing a CANCELLED role', async () => {
      const role = makeRole({ status: 'CANCELLED', filledCount: 0, requiredCount: 2 })
      const updated = { ...role, status: 'CLOSED', closureReason: 'Project cancelled', closedAt: new Date() }
      const prisma = {
        roleReq: {
          findUnique: vi.fn().mockResolvedValue(role),
          update: vi.fn().mockResolvedValue(updated),
        },
      }
      const svc = new RolesService(prisma as never)
      const result = await svc.close('role1', { reason: 'Project cancelled' })
      expect(result.status).toBe('CLOSED')
    })

    it('throws NotFoundException when role does not exist', async () => {
      const prisma = { roleReq: { findUnique: vi.fn().mockResolvedValue(null) } }
      const svc = new RolesService(prisma as never)
      await expect(svc.close('missing', { reason: 'Some reason' })).rejects.toThrow(NotFoundException)
    })
  })

  describe('incrementFilled', () => {
    it('increments filledCount', async () => {
      const role = makeRole({ requiredCount: 3, filledCount: 1, status: 'OPEN' })
      const updated = { ...role, filledCount: 2, status: 'OPEN' }
      const prisma = {
        roleReq: {
          findUnique: vi.fn().mockResolvedValue(role),
          update: vi.fn().mockResolvedValue(updated),
        },
      }
      const svc = new RolesService(prisma as never)
      const result = await svc.incrementFilled('role1')
      expect(prisma.roleReq.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ filledCount: 2 }),
        }),
      )
      expect(result.filledCount).toBe(2)
    })

    it('sets status to FILLED when filledCount reaches requiredCount', async () => {
      const role = makeRole({ requiredCount: 2, filledCount: 1, status: 'OPEN' })
      const updated = { ...role, filledCount: 2, status: 'FILLED' }
      const prisma = {
        roleReq: {
          findUnique: vi.fn().mockResolvedValue(role),
          update: vi.fn().mockResolvedValue(updated),
        },
      }
      const svc = new RolesService(prisma as never)
      const result = await svc.incrementFilled('role1')
      expect(prisma.roleReq.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ filledCount: 2, status: 'FILLED' }),
        }),
      )
      expect(result.status).toBe('FILLED')
    })

    it('clamps filledCount at requiredCount (does not exceed)', async () => {
      const role = makeRole({ requiredCount: 2, filledCount: 2, status: 'FILLED' })
      const prisma = {
        roleReq: {
          findUnique: vi.fn().mockResolvedValue(role),
          update: vi.fn().mockResolvedValue({ ...role, filledCount: 2, status: 'FILLED' }),
        },
      }
      const svc = new RolesService(prisma as never)
      await svc.incrementFilled('role1')
      expect(prisma.roleReq.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ filledCount: 2 }), // clamped, not 3
        }),
      )
    })
  })

  describe('decrementFilled', () => {
    it('decrements filledCount', async () => {
      const role = makeRole({ requiredCount: 3, filledCount: 2, status: 'FILLED' })
      const updated = { ...role, filledCount: 1, status: 'FILLED' }
      const prisma = {
        roleReq: {
          findUnique: vi.fn().mockResolvedValue(role),
          update: vi.fn().mockResolvedValue(updated),
        },
      }
      const svc = new RolesService(prisma as never)
      await svc.decrementFilled('role1')
      expect(prisma.roleReq.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ filledCount: 1 }),
        }),
      )
    })

    it('clamps filledCount at 0 (does not go negative)', async () => {
      const role = makeRole({ requiredCount: 2, filledCount: 0, status: 'OPEN' })
      const prisma = {
        roleReq: {
          findUnique: vi.fn().mockResolvedValue(role),
          update: vi.fn().mockResolvedValue({ ...role, filledCount: 0 }),
        },
      }
      const svc = new RolesService(prisma as never)
      await svc.decrementFilled('role1')
      expect(prisma.roleReq.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ filledCount: 0 }), // clamped at 0
        }),
      )
    })
  })
})
