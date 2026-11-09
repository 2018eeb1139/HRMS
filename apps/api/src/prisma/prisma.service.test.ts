import { describe, it, expect, vi } from 'vitest'
import { PrismaService } from './prisma.service'

describe('PrismaService', () => {
  it('connects on module init', async () => {
    const svc = new PrismaService()
    const spy = vi.spyOn(svc, '$connect').mockResolvedValue(undefined as never)
    await svc.onModuleInit()
    expect(spy).toHaveBeenCalledOnce()
  })
})
