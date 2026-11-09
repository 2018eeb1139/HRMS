import { describe, it, expect } from 'vitest'
import { visibleNavItems, NAV_ITEMS } from './navConfig'

describe('visibleNavItems', () => {
  it('shows Admin only to ADMIN', () => {
    expect(visibleNavItems('ADMIN').some((i) => i.path === '/admin')).toBe(true)
    expect(visibleNavItems('HR').some((i) => i.path === '/admin')).toBe(false)
  })

  it('shows Dashboard, Roles, Interviews, Notifications to every role', () => {
    for (const role of ['HR', 'HIRING_MANAGER', 'PROJECT_MANAGER', 'INTERVIEWER', 'LEADERSHIP', 'ADMIN']) {
      const paths = visibleNavItems(role).map((i) => i.path)
      expect(paths).toContain('/')
      expect(paths).toContain('/roles')
      expect(paths).toContain('/interviews')
      expect(paths).toContain('/notifications')
    }
  })

  it('hides Candidates from INTERVIEWER and LEADERSHIP', () => {
    expect(visibleNavItems('INTERVIEWER').some((i) => i.path === '/candidates')).toBe(false)
    expect(visibleNavItems('LEADERSHIP').some((i) => i.path === '/candidates')).toBe(false)
  })

  it('shows Offboarding only to ADMIN and HR', () => {
    expect(visibleNavItems('ADMIN').some((i) => i.path === '/offboarding')).toBe(true)
    expect(visibleNavItems('HR').some((i) => i.path === '/offboarding')).toBe(true)
    expect(visibleNavItems('PROJECT_MANAGER').some((i) => i.path === '/offboarding')).toBe(false)
  })

  it('returns a subset of NAV_ITEMS', () => {
    const all = new Set(NAV_ITEMS.map((i) => i.path))
    for (const item of visibleNavItems('ADMIN')) expect(all.has(item.path)).toBe(true)
  })
})
