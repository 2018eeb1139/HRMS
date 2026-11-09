import { describe, it, expect, vi, afterEach } from 'vitest'
import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { AuthService } from './auth.service'

const jwt = { sign: vi.fn(() => 'signed.jwt.token') }

describe('AuthService.validateGoogleUser', () => {
  it('links googleId to an existing invited user and returns it', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'u1', email: 'a@picode.example', role: 'HR', isActive: true, googleId: null }),
        update: vi.fn().mockResolvedValue({ id: 'u1', email: 'a@picode.example', role: 'HR', isActive: true, googleId: 'g1' }),
      },
    }
    const svc = new AuthService(prisma as never, jwt as never)
    const user = await svc.validateGoogleUser({ email: 'a@picode.example', googleId: 'g1', name: 'A' })
    expect(user.role).toBe('HR')
    expect(prisma.user.update).toHaveBeenCalled()
  })

  it('rejects a user who was never invited', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } }
    const svc = new AuthService(prisma as never, jwt as never)
    await expect(svc.validateGoogleUser({ email: 'x@nope.example', googleId: 'g2', name: 'X' }))
      .rejects.toThrow('Not authorized')
  })

  it('rejects an inactive user', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ id: 'u3', email: 'a@picode.example', role: 'HR', isActive: false, googleId: null }) } }
    const svc = new AuthService(prisma as never, jwt as never)
    await expect(svc.validateGoogleUser({ email: 'a@picode.example', googleId: 'g3', name: 'A' })).rejects.toThrow('Not authorized')
  })

  it('issues a JWT for a user', () => {
    const svc = new AuthService({} as never, jwt as never)
    expect(svc.issueToken({ id: 'u1', email: 'a@picode.example', role: 'HR' })).toBe('signed.jwt.token')
    expect(jwt.sign).toHaveBeenCalledWith({ sub: 'u1', email: 'a@picode.example', role: 'HR' })
  })
})

describe('AuthService.devLogin', () => {
  afterEach(() => {
    delete process.env.DEV_LOGIN_ENABLED
  })

  it('returns a signed token when flag is enabled and user exists and is active', async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'u2', email: 'hr@picode.example', role: 'HR', isActive: true }),
      },
    }
    const svc = new AuthService(prisma as never, jwt as never)
    const token = await svc.devLogin('hr@picode.example')
    expect(token).toBe('signed.jwt.token')
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'hr@picode.example' } })
  })

  it('throws ForbiddenException when DEV_LOGIN_ENABLED is not set', async () => {
    // flag not set — simulates production
    const svc = new AuthService({} as never, jwt as never)
    await expect(svc.devLogin('hr@picode.example')).rejects.toThrow(ForbiddenException)
    await expect(svc.devLogin('hr@picode.example')).rejects.toThrow('Dev login disabled')
  })

  it('throws ForbiddenException when DEV_LOGIN_ENABLED is false', async () => {
    process.env.DEV_LOGIN_ENABLED = 'false'
    const svc = new AuthService({} as never, jwt as never)
    await expect(svc.devLogin('hr@picode.example')).rejects.toThrow(ForbiddenException)
  })

  it('throws UnauthorizedException when user is not found', async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } }
    const svc = new AuthService(prisma as never, jwt as never)
    await expect(svc.devLogin('nobody@picode.example')).rejects.toThrow(UnauthorizedException)
    await expect(svc.devLogin('nobody@picode.example')).rejects.toThrow('Unknown demo user')
  })

  it('throws UnauthorizedException when user is inactive', async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'u5', email: 'hr@picode.example', role: 'HR', isActive: false }),
      },
    }
    const svc = new AuthService(prisma as never, jwt as never)
    await expect(svc.devLogin('hr@picode.example')).rejects.toThrow(UnauthorizedException)
  })
})

describe('AuthService.listDevUsers', () => {
  afterEach(() => {
    delete process.env.DEV_LOGIN_ENABLED
  })

  it('returns empty array when flag is off', async () => {
    const svc = new AuthService({} as never, jwt as never)
    const result = await svc.listDevUsers()
    expect(result).toEqual([])
  })

  it('returns empty array when flag is explicitly false', async () => {
    process.env.DEV_LOGIN_ENABLED = 'false'
    const svc = new AuthService({} as never, jwt as never)
    expect(await svc.listDevUsers()).toEqual([])
  })

  it('returns mapped active users when flag is on', async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    const mockUsers = [
      { id: 'u1', email: 'admin@picode.example', name: 'Picode Admin', role: 'ADMIN' },
      { id: 'u2', email: 'hr@picode.example',    name: 'Hana HR',      role: 'HR'    },
    ]
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue(mockUsers),
      },
    }
    const svc = new AuthService(prisma as never, jwt as never)
    const result = await svc.listDevUsers()
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ email: 'admin@picode.example', name: 'Picode Admin', role: 'ADMIN' })
    expect(result[1]).toEqual({ email: 'hr@picode.example',    name: 'Hana HR',      role: 'HR'    })
    // id must NOT be in the projected output
    expect(result[0]).not.toHaveProperty('id')
  })
})
