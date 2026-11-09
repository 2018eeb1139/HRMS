import { describe, it, expect, vi } from 'vitest'
import { ConfigService } from './config.service'

describe('ConfigService', () => {
  it('creates a department', async () => {
    const prisma = { department: { create: vi.fn().mockResolvedValue({ id: 'd1', name: 'Engineering' }) } }
    const svc = new ConfigService(prisma as never)
    expect(await svc.createDepartment({ name: 'Engineering' })).toEqual({ id: 'd1', name: 'Engineering' })
  })

  it('updates the singleton org setting', async () => {
    const prisma = {
      orgSetting: { upsert: vi.fn().mockResolvedValue({ id: 'singleton', headcountCountsOn: 'JOINED' }) },
    }
    const svc = new ConfigService(prisma as never)
    const res = await svc.updateOrgSetting({ headcountCountsOn: 'JOINED' })
    expect(res.headcountCountsOn).toBe('JOINED')
    expect(prisma.orgSetting.upsert).toHaveBeenCalledWith({
      where: { id: 'singleton' },
      update: { headcountCountsOn: 'JOINED' },
      create: { id: 'singleton', headcountCountsOn: 'JOINED' },
    })
  })
})
