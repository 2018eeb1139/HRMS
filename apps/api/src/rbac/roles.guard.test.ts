import { describe, it, expect } from 'vitest'
import { Reflector } from '@nestjs/core'
import { ExecutionContext } from '@nestjs/common'
import { RolesGuard } from './roles.guard'
import { ROLES_KEY } from './roles.decorator'

function ctx(user: unknown, required: string[] | undefined): ExecutionContext {
  const handler = () => {}
  if (required) Reflect.defineMetadata(ROLES_KEY, required, handler)
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector())
  it('allows when no roles are required', () => {
    expect(guard.canActivate(ctx({ role: 'INTERVIEWER' }, undefined))).toBe(true)
  })
  it('allows when user role is in the required set', () => {
    expect(guard.canActivate(ctx({ role: 'ADMIN' }, ['ADMIN']))).toBe(true)
  })
  it('denies when user role is not in the required set', () => {
    expect(guard.canActivate(ctx({ role: 'INTERVIEWER' }, ['ADMIN']))).toBe(false)
  })
})
