import { describe, it, expect, vi } from 'vitest'
import { UsersService } from './users.service'

describe('UsersService.invite', () => {
  it('creates an invited user with the given role', async () => {
    const prisma = { user: { create: vi.fn().mockResolvedValue({ id: 'u2', email: 'hr@picode.example', role: 'HR' }) } }
    const svc = new UsersService(prisma as never)
    const user = await svc.invite({ email: 'hr@picode.example', name: 'HR One', role: 'HR' })
    expect(user.role).toBe('HR')
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: 'hr@picode.example', name: 'HR One', role: 'HR' },
    })
  })
})
