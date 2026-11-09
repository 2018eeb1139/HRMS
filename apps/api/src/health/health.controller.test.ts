import { describe, it, expect } from 'vitest'
import { HealthController } from './health.controller'

describe('HealthController', () => {
  it('returns ok envelope', () => {
    expect(new HealthController().check()).toEqual({ success: true, data: { status: 'ok' }, error: null })
  })
})
