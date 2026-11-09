import { describe, it, expect, vi } from 'vitest'
import { HttpStatus, UnauthorizedException } from '@nestjs/common'
import { ZodError, z } from 'zod'
import type { ArgumentsHost } from '@nestjs/common'
import { AllExceptionsFilter } from './all-exceptions.filter'

function makeHost() {
  const json = vi.fn()
  const status = vi.fn(() => ({ json }))
  const getResponse = vi.fn(() => ({ status }))
  const switchToHttp = vi.fn(() => ({ getResponse }))
  const host = { switchToHttp } as unknown as ArgumentsHost
  return { host, status, json }
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter()

  it('returns 400 with fail envelope for a ZodError', () => {
    const { host, status, json } = makeHost()
    let zodErr: ZodError
    try {
      z.object({ name: z.string() }).parse({ name: 123 })
    } catch (e) {
      zodErr = e as ZodError
    }
    filter.catch(zodErr!, host)
    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    )
  })

  it('returns the HttpException status with fail envelope', () => {
    const { host, status, json } = makeHost()
    filter.catch(new UnauthorizedException('Not authorized'), host)
    expect(status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Not authorized' }),
    )
  })

  it('returns 500 with fail("Internal server error") for a generic Error', () => {
    const { host, status, json } = makeHost()
    filter.catch(new Error('boom'), host)
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Internal server error' }),
    )
  })
})
