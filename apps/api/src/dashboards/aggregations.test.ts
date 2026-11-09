import { describe, it, expect } from 'vitest'
import { roleRisk, headcountTotals, gapAnalysis } from './aggregations'
import type { GapRole } from './aggregations'

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOW = new Date('2026-06-09T10:00:00Z')

const daysFromNow = (days: number) =>
  new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000)

function makeRole(overrides: Partial<GapRole> = {}): GapRole {
  return {
    id: 'role1',
    requiredCount: 2,
    filledCount: 0,
    status: 'OPEN',
    targetJoiningDate: null,
    targetClosureDate: null,
    project: null,
    applications: [],
    ...overrides,
  }
}

function makeApp(
  overrides: Partial<GapRole['applications'][0]> = {},
): GapRole['applications'][0] {
  return {
    id: 'app1',
    roleId: 'role1',
    matchScore: null,
    currentStage: null,
    status: 'ACTIVE',
    offer: null,
    interviews: [],
    ...overrides,
  }
}

// ── roleRisk ──────────────────────────────────────────────────────────────────

describe('roleRisk', () => {
  it('returns LOW when gap is 0 (fully staffed)', () => {
    expect(roleRisk({ requiredCount: 2, filledCount: 2 }, NOW)).toBe('LOW')
  })

  it('returns LOW when filledCount exceeds requiredCount', () => {
    expect(roleRisk({ requiredCount: 1, filledCount: 3 }, NOW)).toBe('LOW')
  })

  it('returns MEDIUM when gap > 0 and no closure date', () => {
    expect(roleRisk({ requiredCount: 3, filledCount: 1 }, NOW)).toBe('MEDIUM')
  })

  it('returns MEDIUM when gap > 0 and closure date > 7 days away', () => {
    expect(
      roleRisk({ requiredCount: 2, filledCount: 0, targetClosureDate: daysFromNow(14) }, NOW),
    ).toBe('MEDIUM')
  })

  it('returns HIGH when gap > 0 and closure date is exactly 7 days away', () => {
    expect(
      roleRisk({ requiredCount: 2, filledCount: 0, targetClosureDate: daysFromNow(7) }, NOW),
    ).toBe('HIGH')
  })

  it('returns HIGH when gap > 0 and closure date is within 7 days (3 days)', () => {
    expect(
      roleRisk({ requiredCount: 2, filledCount: 0, targetClosureDate: daysFromNow(3) }, NOW),
    ).toBe('HIGH')
  })

  it('returns HIGH when gap > 0 and closure date is in the past', () => {
    expect(
      roleRisk({ requiredCount: 2, filledCount: 0, targetClosureDate: daysFromNow(-1) }, NOW),
    ).toBe('HIGH')
  })

  it('returns MEDIUM when gap > 0 and closure date is exactly 8 days away (boundary)', () => {
    expect(
      roleRisk({ requiredCount: 1, filledCount: 0, targetClosureDate: daysFromNow(8) }, NOW),
    ).toBe('MEDIUM')
  })
})

// ── headcountTotals ───────────────────────────────────────────────────────────

describe('headcountTotals', () => {
  it('returns zeroes for empty array', () => {
    expect(headcountTotals([])).toEqual({
      openRoles: 0,
      requiredPositions: 0,
      filledPositions: 0,
      gap: 0,
    })
  })

  it('sums required and filled across active roles', () => {
    const roles = [
      { requiredCount: 3, filledCount: 1, status: 'OPEN' },
      { requiredCount: 2, filledCount: 2, status: 'IN_PROGRESS' },
    ]
    expect(headcountTotals(roles)).toEqual({
      openRoles: 1, // only role with gap > 0
      requiredPositions: 5,
      filledPositions: 3,
      gap: 2,
    })
  })

  it('excludes CANCELLED roles', () => {
    const roles = [
      { requiredCount: 5, filledCount: 0, status: 'CANCELLED' },
      { requiredCount: 2, filledCount: 1, status: 'OPEN' },
    ]
    expect(headcountTotals(roles)).toEqual({
      openRoles: 1,
      requiredPositions: 2,
      filledPositions: 1,
      gap: 1,
    })
  })

  it('excludes CLOSED roles', () => {
    const roles = [
      { requiredCount: 10, filledCount: 10, status: 'CLOSED' },
      { requiredCount: 1, filledCount: 0, status: 'OPEN' },
    ]
    expect(headcountTotals(roles)).toEqual({
      openRoles: 1,
      requiredPositions: 1,
      filledPositions: 0,
      gap: 1,
    })
  })

  it('counts openRoles only for roles with gap > 0', () => {
    const roles = [
      { requiredCount: 2, filledCount: 2, status: 'FILLED' }, // gap=0
      { requiredCount: 3, filledCount: 1, status: 'OPEN' },    // gap=2
      { requiredCount: 1, filledCount: 0, status: 'IN_PROGRESS' }, // gap=1
    ]
    const result = headcountTotals(roles)
    expect(result.openRoles).toBe(2)
    expect(result.requiredPositions).toBe(6)
    expect(result.filledPositions).toBe(3)
    expect(result.gap).toBe(3)
  })
})

// ── gapAnalysis ───────────────────────────────────────────────────────────────

describe('gapAnalysis — roleGap', () => {
  it('flags OPEN role with unfilled seats', () => {
    const role = makeRole({ id: 'r1', requiredCount: 3, filledCount: 1, status: 'OPEN' })
    const result = gapAnalysis([role], NOW)
    expect(result.roleGaps).toHaveLength(1)
    expect(result.roleGaps[0].roleId).toBe('r1')
  })

  it('flags IN_PROGRESS role with unfilled seats', () => {
    const role = makeRole({ id: 'r2', requiredCount: 2, filledCount: 0, status: 'IN_PROGRESS' })
    const result = gapAnalysis([role], NOW)
    expect(result.roleGaps).toHaveLength(1)
  })

  it('does NOT flag fully filled role', () => {
    const role = makeRole({ requiredCount: 2, filledCount: 2, status: 'OPEN' })
    expect(gapAnalysis([role], NOW).roleGaps).toHaveLength(0)
  })

  it('does NOT flag CANCELLED role even with gap', () => {
    const role = makeRole({ requiredCount: 3, filledCount: 0, status: 'CANCELLED' })
    expect(gapAnalysis([role], NOW).roleGaps).toHaveLength(0)
  })

  it('does NOT flag CLOSED role', () => {
    const role = makeRole({ requiredCount: 2, filledCount: 1, status: 'CLOSED' })
    expect(gapAnalysis([role], NOW).roleGaps).toHaveLength(0)
  })
})

describe('gapAnalysis — skillGap', () => {
  it('flags role where all screened applications score below 75', () => {
    const app = makeApp({ id: 'a1', matchScore: 60 })
    const role = makeRole({ id: 'r1', status: 'OPEN', applications: [app] })
    const result = gapAnalysis([role], NOW)
    expect(result.skillGaps).toHaveLength(1)
    expect(result.skillGaps[0].roleId).toBe('r1')
  })

  it('does NOT flag role when at least one application scores >= 75', () => {
    const apps = [makeApp({ matchScore: 60 }), makeApp({ id: 'a2', matchScore: 80 })]
    const role = makeRole({ status: 'OPEN', applications: apps })
    expect(gapAnalysis([role], NOW).skillGaps).toHaveLength(0)
  })

  it('does NOT flag role with no applications', () => {
    const role = makeRole({ status: 'OPEN', applications: [] })
    expect(gapAnalysis([role], NOW).skillGaps).toHaveLength(0)
  })

  it('does NOT flag role when applications have no matchScore yet', () => {
    // No screened apps — matchScore is null; heuristic only fires on scored apps
    const app = makeApp({ matchScore: null })
    const role = makeRole({ status: 'OPEN', applications: [app] })
    expect(gapAnalysis([role], NOW).skillGaps).toHaveLength(0)
  })

  it('does NOT flag non-active role', () => {
    const app = makeApp({ matchScore: 50 })
    const role = makeRole({ status: 'ON_HOLD', applications: [app] })
    expect(gapAnalysis([role], NOW).skillGaps).toHaveLength(0)
  })
})

describe('gapAnalysis — timelineGap', () => {
  it('flags role with deadline within 14 days and no confirmed joiners', () => {
    const role = makeRole({
      id: 'r1',
      requiredCount: 2,
      filledCount: 0,
      targetJoiningDate: daysFromNow(10),
    })
    const result = gapAnalysis([role], NOW)
    expect(result.timelineGaps).toHaveLength(1)
    expect(result.timelineGaps[0].roleId).toBe('r1')
  })

  it('does NOT flag role with deadline more than 14 days away', () => {
    const role = makeRole({ targetJoiningDate: daysFromNow(20), requiredCount: 2, filledCount: 0 })
    expect(gapAnalysis([role], NOW).timelineGaps).toHaveLength(0)
  })

  it('does NOT flag fully confirmed role', () => {
    const app = makeApp({ offer: { status: 'ACCEPTED' } })
    const role = makeRole({
      requiredCount: 1,
      filledCount: 0,
      targetJoiningDate: daysFromNow(5),
      applications: [app],
    })
    expect(gapAnalysis([role], NOW).timelineGaps).toHaveLength(0)
  })

  it('uses project.startDate when targetJoiningDate is absent', () => {
    const role = makeRole({
      id: 'r1',
      requiredCount: 1,
      filledCount: 0,
      targetJoiningDate: null,
      project: { startDate: daysFromNow(7) },
    })
    const result = gapAnalysis([role], NOW)
    expect(result.timelineGaps).toHaveLength(1)
  })

  it('does NOT flag when no deadline is set', () => {
    const role = makeRole({ requiredCount: 2, filledCount: 0 }) // no dates
    expect(gapAnalysis([role], NOW).timelineGaps).toHaveLength(0)
  })
})

describe('gapAnalysis — pipelineGap', () => {
  it('flags role where active application count < remaining', () => {
    const app = makeApp({ status: 'ACTIVE' })
    const role = makeRole({ id: 'r1', requiredCount: 3, filledCount: 0, applications: [app] })
    const result = gapAnalysis([role], NOW)
    expect(result.pipelineGaps).toHaveLength(1)
    expect(result.pipelineGaps[0].roleId).toBe('r1')
  })

  it('does NOT flag role with enough active applications', () => {
    const apps = [makeApp(), makeApp({ id: 'a2' }), makeApp({ id: 'a3' })]
    const role = makeRole({ requiredCount: 2, filledCount: 0, applications: apps })
    expect(gapAnalysis([role], NOW).pipelineGaps).toHaveLength(0)
  })

  it('excludes REJECTED applications from active count', () => {
    const apps = [
      makeApp({ status: 'REJECTED' }),
      makeApp({ id: 'a2', status: 'WITHDRAWN' }),
    ]
    const role = makeRole({ requiredCount: 1, filledCount: 0, applications: apps })
    expect(gapAnalysis([role], NOW).pipelineGaps).toHaveLength(1)
  })

  it('does NOT flag CLOSED role', () => {
    const role = makeRole({ requiredCount: 2, filledCount: 0, status: 'CLOSED' })
    expect(gapAnalysis([role], NOW).pipelineGaps).toHaveLength(0)
  })
})

describe('gapAnalysis — offerGap', () => {
  it('flags application at SELECTED stage with no active offer', () => {
    const app = makeApp({
      id: 'a1',
      currentStage: { key: 'SELECTED', order: 5 },
      offer: null,
    })
    const role = makeRole({ applications: [app] })
    const result = gapAnalysis([role], NOW)
    expect(result.offerGaps).toHaveLength(1)
    expect(result.offerGaps[0].applicationId).toBe('a1')
  })

  it('flags application at OFFER stage with offer in TO_BE_PREPARED (not progressed)', () => {
    const app = makeApp({
      id: 'a1',
      currentStage: { key: 'OFFER', order: 6 },
      offer: { status: 'TO_BE_PREPARED' },
    })
    const role = makeRole({ applications: [app] })
    expect(gapAnalysis([role], NOW).offerGaps).toHaveLength(1)
  })

  it('does NOT flag application at SELECTED stage with SENT offer', () => {
    const app = makeApp({
      currentStage: { key: 'SELECTED', order: 5 },
      offer: { status: 'SENT' },
    })
    const role = makeRole({ applications: [app] })
    expect(gapAnalysis([role], NOW).offerGaps).toHaveLength(0)
  })

  it('does NOT flag application at early pipeline stage', () => {
    const app = makeApp({
      currentStage: { key: 'CV_RECEIVED', order: 1 },
      offer: null,
    })
    const role = makeRole({ applications: [app] })
    expect(gapAnalysis([role], NOW).offerGaps).toHaveLength(0)
  })
})

describe('gapAnalysis — feedbackGap', () => {
  it('flags COMPLETED interview with no feedback', () => {
    const interview = { id: 'iv1', status: 'COMPLETED', feedback: [] }
    const app = makeApp({ interviews: [interview] })
    const role = makeRole({ applications: [app] })
    const result = gapAnalysis([role], NOW)
    expect(result.feedbackGaps).toHaveLength(1)
    expect(result.feedbackGaps[0].interviewId).toBe('iv1')
  })

  it('does NOT flag COMPLETED interview that has feedback', () => {
    const interview = { id: 'iv1', status: 'COMPLETED', feedback: [{ id: 'fb1' }] }
    const app = makeApp({ interviews: [interview] })
    const role = makeRole({ applications: [app] })
    expect(gapAnalysis([role], NOW).feedbackGaps).toHaveLength(0)
  })

  it('does NOT flag SCHEDULED interview with no feedback', () => {
    const interview = { id: 'iv1', status: 'SCHEDULED', feedback: [] }
    const app = makeApp({ interviews: [interview] })
    const role = makeRole({ applications: [app] })
    expect(gapAnalysis([role], NOW).feedbackGaps).toHaveLength(0)
  })

  it('flags multiple completed interviews across multiple applications', () => {
    const iv1 = { id: 'iv1', status: 'COMPLETED', feedback: [] }
    const iv2 = { id: 'iv2', status: 'COMPLETED', feedback: [] }
    const app1 = makeApp({ id: 'a1', interviews: [iv1] })
    const app2 = makeApp({ id: 'a2', interviews: [iv2] })
    const role = makeRole({ applications: [app1, app2] })
    const result = gapAnalysis([role], NOW)
    expect(result.feedbackGaps).toHaveLength(2)
  })
})
