import { describe, it, expect } from 'vitest'
import { evaluateAlerts } from './alerts'
import type { AlertSnapshot } from './alerts.schemas'

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOW = '2026-06-09T10:00:00.000Z'
const nowMs = new Date(NOW).getTime()

function ms(ms: number): string {
  return new Date(nowMs + ms).toISOString()
}

function daysAgo(d: number): string {
  return new Date(nowMs - d * 24 * 60 * 60 * 1000).toISOString()
}

function daysFromNow(d: number): string {
  return new Date(nowMs + d * 24 * 60 * 60 * 1000).toISOString()
}

function hoursAgo(h: number): string {
  return new Date(nowMs - h * 60 * 60 * 1000).toISOString()
}

function emptySnapshot(overrides: Partial<AlertSnapshot> = {}): AlertSnapshot {
  return {
    now: NOW,
    roles: [],
    completedInterviews: [],
    selectedWithoutOffer: [],
    projectsStartingSoon: [],
    joiners: [],
    overdueFollowUps: [],
    ...overrides,
  }
}

// ── ROLE_NO_SHORTLIST ─────────────────────────────────────────────────────────

describe('ROLE_NO_SHORTLIST', () => {
  it('raises alert when OPEN role is older than 7 days with 0 shortlisted', () => {
    const snapshot = emptySnapshot({
      roles: [
        {
          id: 'role-1',
          title: 'Backend Engineer',
          status: 'OPEN',
          priority: 'MEDIUM',
          requiredCount: 2,
          filledCount: 0,
          hrOwnerId: 'user-hr-1',
          createdAt: daysAgo(8),
          shortlistedCount: 0,
          activeApplicationCount: 0,
        },
      ],
    })
    const alerts = evaluateAlerts(snapshot)
    const hit = alerts.find((a) => a.type === 'ROLE_NO_SHORTLIST')
    expect(hit).toBeDefined()
    expect(hit?.userId).toBe('user-hr-1')
    expect(hit?.entityId).toBe('role-1')
  })

  it('does NOT raise alert when role is 6 days old (below threshold)', () => {
    const snapshot = emptySnapshot({
      roles: [
        {
          id: 'role-2',
          title: 'Frontend Engineer',
          status: 'OPEN',
          priority: 'MEDIUM',
          requiredCount: 1,
          filledCount: 0,
          hrOwnerId: 'user-hr-1',
          createdAt: daysAgo(6),
          shortlistedCount: 0,
          activeApplicationCount: 0,
        },
      ],
    })
    const alerts = evaluateAlerts(snapshot)
    expect(alerts.find((a) => a.type === 'ROLE_NO_SHORTLIST')).toBeUndefined()
  })

  it('does NOT raise alert when shortlistedCount > 0', () => {
    const snapshot = emptySnapshot({
      roles: [
        {
          id: 'role-3',
          title: 'Designer',
          status: 'OPEN',
          priority: 'MEDIUM',
          requiredCount: 1,
          filledCount: 0,
          hrOwnerId: 'user-hr-1',
          createdAt: daysAgo(10),
          shortlistedCount: 2,
          activeApplicationCount: 5,
        },
      ],
    })
    const alerts = evaluateAlerts(snapshot)
    expect(alerts.find((a) => a.type === 'ROLE_NO_SHORTLIST')).toBeUndefined()
  })

  it('does NOT raise alert when hrOwnerId is missing', () => {
    const snapshot = emptySnapshot({
      roles: [
        {
          id: 'role-4',
          title: 'PM',
          status: 'OPEN',
          priority: 'MEDIUM',
          requiredCount: 1,
          filledCount: 0,
          hrOwnerId: null,
          createdAt: daysAgo(10),
          shortlistedCount: 0,
          activeApplicationCount: 0,
        },
      ],
    })
    const alerts = evaluateAlerts(snapshot)
    expect(alerts.find((a) => a.type === 'ROLE_NO_SHORTLIST')).toBeUndefined()
  })

  it('respects custom noShortlistDays threshold', () => {
    const snapshot = emptySnapshot({
      roles: [
        {
          id: 'role-5',
          title: 'Analyst',
          status: 'IN_PROGRESS',
          priority: 'MEDIUM',
          requiredCount: 1,
          filledCount: 0,
          hrOwnerId: 'user-hr-2',
          createdAt: daysAgo(4),
          shortlistedCount: 0,
          activeApplicationCount: 0,
        },
      ],
    })
    // default=7, no alert for 4 days
    expect(evaluateAlerts(snapshot).find((a) => a.type === 'ROLE_NO_SHORTLIST')).toBeUndefined()
    // custom=3, alert fires for 4 days
    const hit = evaluateAlerts(snapshot, { noShortlistDays: 3 }).find(
      (a) => a.type === 'ROLE_NO_SHORTLIST',
    )
    expect(hit).toBeDefined()
  })
})

// ── FEEDBACK_PENDING_24H ──────────────────────────────────────────────────────

describe('FEEDBACK_PENDING_24H', () => {
  it('raises alert for completed interview >24h ago with no feedback', () => {
    const snapshot = emptySnapshot({
      completedInterviews: [
        {
          id: 'iv-1',
          applicationId: 'app-1',
          scheduledAt: hoursAgo(25),
          hrOwnerId: 'user-hr-1',
          interviewerIds: ['user-iv-1'],
          feedbackCount: 0,
        },
      ],
    })
    const hit = evaluateAlerts(snapshot).find((a) => a.type === 'FEEDBACK_PENDING_24H')
    expect(hit).toBeDefined()
    expect(hit?.userId).toBe('user-hr-1')
    expect(hit?.entityId).toBe('iv-1')
  })

  it('does NOT raise alert for interview only 23h ago', () => {
    const snapshot = emptySnapshot({
      completedInterviews: [
        {
          id: 'iv-2',
          applicationId: 'app-2',
          scheduledAt: hoursAgo(23),
          hrOwnerId: 'user-hr-1',
          interviewerIds: [],
          feedbackCount: 0,
        },
      ],
    })
    expect(evaluateAlerts(snapshot).find((a) => a.type === 'FEEDBACK_PENDING_24H')).toBeUndefined()
  })

  it('does NOT raise alert when feedbackCount > 0', () => {
    const snapshot = emptySnapshot({
      completedInterviews: [
        {
          id: 'iv-3',
          applicationId: 'app-3',
          scheduledAt: hoursAgo(30),
          hrOwnerId: 'user-hr-1',
          interviewerIds: ['user-iv-1'],
          feedbackCount: 1,
        },
      ],
    })
    expect(evaluateAlerts(snapshot).find((a) => a.type === 'FEEDBACK_PENDING_24H')).toBeUndefined()
  })

  it('does NOT raise alert when hrOwnerId is missing', () => {
    const snapshot = emptySnapshot({
      completedInterviews: [
        {
          id: 'iv-4',
          applicationId: 'app-4',
          scheduledAt: hoursAgo(30),
          hrOwnerId: null,
          interviewerIds: [],
          feedbackCount: 0,
        },
      ],
    })
    expect(evaluateAlerts(snapshot).find((a) => a.type === 'FEEDBACK_PENDING_24H')).toBeUndefined()
  })

  it('raises one alert per interview (not per interviewer)', () => {
    const snapshot = emptySnapshot({
      completedInterviews: [
        {
          id: 'iv-5',
          applicationId: 'app-5',
          scheduledAt: hoursAgo(30),
          hrOwnerId: 'user-hr-1',
          interviewerIds: ['iv-a', 'iv-b', 'iv-c'],
          feedbackCount: 0,
        },
      ],
    })
    const hits = evaluateAlerts(snapshot).filter((a) => a.type === 'FEEDBACK_PENDING_24H')
    expect(hits).toHaveLength(1)
  })
})

// ── OFFER_NOT_SENT ────────────────────────────────────────────────────────────

describe('OFFER_NOT_SENT', () => {
  it('raises alert for selected candidate without offer', () => {
    const snapshot = emptySnapshot({
      selectedWithoutOffer: [{ applicationId: 'app-10', hrOwnerId: 'user-hr-1' }],
    })
    const hit = evaluateAlerts(snapshot).find((a) => a.type === 'OFFER_NOT_SENT')
    expect(hit).toBeDefined()
    expect(hit?.userId).toBe('user-hr-1')
    expect(hit?.entityId).toBe('app-10')
  })

  it('does NOT raise alert when hrOwnerId is missing', () => {
    const snapshot = emptySnapshot({
      selectedWithoutOffer: [{ applicationId: 'app-11', hrOwnerId: null }],
    })
    expect(evaluateAlerts(snapshot).find((a) => a.type === 'OFFER_NOT_SENT')).toBeUndefined()
  })

  it('raises one alert per selected-without-offer entry', () => {
    const snapshot = emptySnapshot({
      selectedWithoutOffer: [
        { applicationId: 'app-12', hrOwnerId: 'hr-1' },
        { applicationId: 'app-13', hrOwnerId: 'hr-2' },
      ],
    })
    const hits = evaluateAlerts(snapshot).filter((a) => a.type === 'OFFER_NOT_SENT')
    expect(hits).toHaveLength(2)
  })
})

// ── PROJECT_START_WITH_GAPS ───────────────────────────────────────────────────

describe('PROJECT_START_WITH_GAPS', () => {
  it('raises alert when project starts within 14 days and has gaps', () => {
    const snapshot = emptySnapshot({
      projectsStartingSoon: [
        {
          id: 'proj-1',
          name: 'Alpha Launch',
          startDate: daysFromNow(10),
          projectManagerId: 'user-pm-1',
          gap: 2,
        },
      ],
    })
    const hit = evaluateAlerts(snapshot).find((a) => a.type === 'PROJECT_START_WITH_GAPS')
    expect(hit).toBeDefined()
    expect(hit?.userId).toBe('user-pm-1')
    expect(hit?.entityId).toBe('proj-1')
  })

  it('does NOT raise alert when project starts in 15 days (beyond default threshold)', () => {
    const snapshot = emptySnapshot({
      projectsStartingSoon: [
        {
          id: 'proj-2',
          name: 'Beta Launch',
          startDate: daysFromNow(15),
          projectManagerId: 'user-pm-1',
          gap: 3,
        },
      ],
    })
    expect(
      evaluateAlerts(snapshot).find((a) => a.type === 'PROJECT_START_WITH_GAPS'),
    ).toBeUndefined()
  })

  it('does NOT raise alert when gap is 0', () => {
    const snapshot = emptySnapshot({
      projectsStartingSoon: [
        {
          id: 'proj-3',
          name: 'Gamma',
          startDate: daysFromNow(5),
          projectManagerId: 'user-pm-1',
          gap: 0,
        },
      ],
    })
    expect(
      evaluateAlerts(snapshot).find((a) => a.type === 'PROJECT_START_WITH_GAPS'),
    ).toBeUndefined()
  })

  it('does NOT raise alert when projectManagerId is missing', () => {
    const snapshot = emptySnapshot({
      projectsStartingSoon: [
        {
          id: 'proj-4',
          name: 'Delta',
          startDate: daysFromNow(5),
          projectManagerId: null,
          gap: 2,
        },
      ],
    })
    expect(
      evaluateAlerts(snapshot).find((a) => a.type === 'PROJECT_START_WITH_GAPS'),
    ).toBeUndefined()
  })
})

// ── JOINING_DOCS_PENDING ──────────────────────────────────────────────────────

describe('JOINING_DOCS_PENDING', () => {
  it('raises alert when joiner is within 7 days and has pending docs', () => {
    const snapshot = emptySnapshot({
      joiners: [
        {
          offerId: 'offer-1',
          hrOwnerId: 'user-hr-1',
          joiningDate: daysFromNow(5),
          documentsPending: ['id-proof', 'bank-details'],
        },
      ],
    })
    const hit = evaluateAlerts(snapshot).find((a) => a.type === 'JOINING_DOCS_PENDING')
    expect(hit).toBeDefined()
    expect(hit?.userId).toBe('user-hr-1')
    expect(hit?.entityId).toBe('offer-1')
  })

  it('does NOT raise alert when joiner is 8 days away (beyond default threshold)', () => {
    const snapshot = emptySnapshot({
      joiners: [
        {
          offerId: 'offer-2',
          hrOwnerId: 'user-hr-1',
          joiningDate: daysFromNow(8),
          documentsPending: ['passport-copy'],
        },
      ],
    })
    expect(evaluateAlerts(snapshot).find((a) => a.type === 'JOINING_DOCS_PENDING')).toBeUndefined()
  })

  it('does NOT raise alert when documentsPending is empty', () => {
    const snapshot = emptySnapshot({
      joiners: [
        {
          offerId: 'offer-3',
          hrOwnerId: 'user-hr-1',
          joiningDate: daysFromNow(3),
          documentsPending: [],
        },
      ],
    })
    expect(evaluateAlerts(snapshot).find((a) => a.type === 'JOINING_DOCS_PENDING')).toBeUndefined()
  })

  it('does NOT raise alert when hrOwnerId is missing', () => {
    const snapshot = emptySnapshot({
      joiners: [
        {
          offerId: 'offer-4',
          hrOwnerId: null,
          joiningDate: daysFromNow(3),
          documentsPending: ['nda'],
        },
      ],
    })
    expect(evaluateAlerts(snapshot).find((a) => a.type === 'JOINING_DOCS_PENDING')).toBeUndefined()
  })
})

// ── ROLE_FULFILLED ────────────────────────────────────────────────────────────

describe('ROLE_FULFILLED', () => {
  it('raises alert when filledCount >= requiredCount and status is not CLOSED/CANCELLED', () => {
    const snapshot = emptySnapshot({
      roles: [
        {
          id: 'role-20',
          title: 'QA Engineer',
          status: 'IN_PROGRESS',
          priority: 'MEDIUM',
          requiredCount: 2,
          filledCount: 2,
          hrOwnerId: 'user-hr-1',
          createdAt: daysAgo(30),
          shortlistedCount: 5,
          activeApplicationCount: 2,
        },
      ],
    })
    const hit = evaluateAlerts(snapshot).find((a) => a.type === 'ROLE_FULFILLED')
    expect(hit).toBeDefined()
    expect(hit?.userId).toBe('user-hr-1')
    expect(hit?.entityId).toBe('role-20')
  })

  it('does NOT raise alert when status is CLOSED', () => {
    const snapshot = emptySnapshot({
      roles: [
        {
          id: 'role-21',
          title: 'QA Lead',
          status: 'CLOSED',
          priority: 'MEDIUM',
          requiredCount: 1,
          filledCount: 1,
          hrOwnerId: 'user-hr-1',
          createdAt: daysAgo(30),
          shortlistedCount: 3,
          activeApplicationCount: 0,
        },
      ],
    })
    expect(evaluateAlerts(snapshot).find((a) => a.type === 'ROLE_FULFILLED')).toBeUndefined()
  })

  it('does NOT raise alert when filledCount < requiredCount', () => {
    const snapshot = emptySnapshot({
      roles: [
        {
          id: 'role-22',
          title: 'DevOps',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
          requiredCount: 3,
          filledCount: 2,
          hrOwnerId: 'user-hr-1',
          createdAt: daysAgo(20),
          shortlistedCount: 4,
          activeApplicationCount: 3,
        },
      ],
    })
    expect(evaluateAlerts(snapshot).find((a) => a.type === 'ROLE_FULFILLED')).toBeUndefined()
  })

  it('does NOT raise alert when hrOwnerId is missing', () => {
    const snapshot = emptySnapshot({
      roles: [
        {
          id: 'role-23',
          title: 'Data Scientist',
          status: 'FILLED',
          priority: 'MEDIUM',
          requiredCount: 1,
          filledCount: 1,
          hrOwnerId: null,
          createdAt: daysAgo(30),
          shortlistedCount: 2,
          activeApplicationCount: 0,
        },
      ],
    })
    expect(evaluateAlerts(snapshot).find((a) => a.type === 'ROLE_FULFILLED')).toBeUndefined()
  })
})

// ── HIGH_PRIORITY_ROLE_DELAYED ────────────────────────────────────────────────

describe('HIGH_PRIORITY_ROLE_DELAYED', () => {
  it('raises alert for HIGH priority role past closure date with unfilled positions', () => {
    const snapshot = emptySnapshot({
      roles: [
        {
          id: 'role-30',
          title: 'CTO',
          status: 'OPEN',
          priority: 'HIGH',
          requiredCount: 1,
          filledCount: 0,
          hrOwnerId: 'user-hr-1',
          targetClosureDate: daysAgo(3),
          createdAt: daysAgo(60),
          shortlistedCount: 1,
          activeApplicationCount: 1,
        },
      ],
    })
    const hit = evaluateAlerts(snapshot).find((a) => a.type === 'HIGH_PRIORITY_ROLE_DELAYED')
    expect(hit).toBeDefined()
    expect(hit?.userId).toBe('user-hr-1')
    expect(hit?.entityId).toBe('role-30')
  })

  it('raises alert for CRITICAL priority role past closure date', () => {
    const snapshot = emptySnapshot({
      roles: [
        {
          id: 'role-31',
          title: 'Security Engineer',
          status: 'IN_PROGRESS',
          priority: 'CRITICAL',
          requiredCount: 2,
          filledCount: 1,
          hrOwnerId: 'user-hr-2',
          targetClosureDate: daysAgo(1),
          createdAt: daysAgo(90),
          shortlistedCount: 3,
          activeApplicationCount: 2,
        },
      ],
    })
    const hit = evaluateAlerts(snapshot).find((a) => a.type === 'HIGH_PRIORITY_ROLE_DELAYED')
    expect(hit).toBeDefined()
    expect(hit?.userId).toBe('user-hr-2')
  })

  it('does NOT raise alert when targetClosureDate is in the future', () => {
    const snapshot = emptySnapshot({
      roles: [
        {
          id: 'role-32',
          title: 'Product Manager',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
          requiredCount: 1,
          filledCount: 0,
          hrOwnerId: 'user-hr-1',
          targetClosureDate: daysFromNow(5),
          createdAt: daysAgo(10),
          shortlistedCount: 1,
          activeApplicationCount: 1,
        },
      ],
    })
    expect(
      evaluateAlerts(snapshot).find((a) => a.type === 'HIGH_PRIORITY_ROLE_DELAYED'),
    ).toBeUndefined()
  })

  it('does NOT raise alert for MEDIUM priority role', () => {
    const snapshot = emptySnapshot({
      roles: [
        {
          id: 'role-33',
          title: 'Support',
          status: 'OPEN',
          priority: 'MEDIUM',
          requiredCount: 1,
          filledCount: 0,
          hrOwnerId: 'user-hr-1',
          targetClosureDate: daysAgo(5),
          createdAt: daysAgo(30),
          shortlistedCount: 0,
          activeApplicationCount: 0,
        },
      ],
    })
    expect(
      evaluateAlerts(snapshot).find((a) => a.type === 'HIGH_PRIORITY_ROLE_DELAYED'),
    ).toBeUndefined()
  })

  it('does NOT raise alert when all positions are filled', () => {
    const snapshot = emptySnapshot({
      roles: [
        {
          id: 'role-34',
          title: 'Lead Dev',
          status: 'FILLED',
          priority: 'CRITICAL',
          requiredCount: 2,
          filledCount: 2,
          hrOwnerId: 'user-hr-1',
          targetClosureDate: daysAgo(2),
          createdAt: daysAgo(30),
          shortlistedCount: 5,
          activeApplicationCount: 0,
        },
      ],
    })
    expect(
      evaluateAlerts(snapshot).find((a) => a.type === 'HIGH_PRIORITY_ROLE_DELAYED'),
    ).toBeUndefined()
  })

  it('does NOT raise alert when hrOwnerId is missing', () => {
    const snapshot = emptySnapshot({
      roles: [
        {
          id: 'role-35',
          title: 'Architect',
          status: 'OPEN',
          priority: 'HIGH',
          requiredCount: 1,
          filledCount: 0,
          hrOwnerId: null,
          targetClosureDate: daysAgo(2),
          createdAt: daysAgo(30),
          shortlistedCount: 0,
          activeApplicationCount: 0,
        },
      ],
    })
    expect(
      evaluateAlerts(snapshot).find((a) => a.type === 'HIGH_PRIORITY_ROLE_DELAYED'),
    ).toBeUndefined()
  })
})

// ── CANDIDATE_UNRESPONSIVE ────────────────────────────────────────────────────

describe('CANDIDATE_UNRESPONSIVE', () => {
  it('raises alert for each overdue follow-up', () => {
    const snapshot = emptySnapshot({
      overdueFollowUps: [
        { communicationId: 'comm-1', ownerId: 'user-hr-1' },
        { communicationId: 'comm-2', ownerId: 'user-hr-2' },
      ],
    })
    const hits = evaluateAlerts(snapshot).filter((a) => a.type === 'CANDIDATE_UNRESPONSIVE')
    expect(hits).toHaveLength(2)
    expect(hits[0]?.userId).toBe('user-hr-1')
    expect(hits[0]?.entityId).toBe('comm-1')
    expect(hits[1]?.userId).toBe('user-hr-2')
  })

  it('raises no alert when overdueFollowUps is empty', () => {
    const snapshot = emptySnapshot({ overdueFollowUps: [] })
    expect(
      evaluateAlerts(snapshot).find((a) => a.type === 'CANDIDATE_UNRESPONSIVE'),
    ).toBeUndefined()
  })
})

// ── Empty snapshot produces no alerts ────────────────────────────────────────

describe('evaluateAlerts with all-empty snapshot', () => {
  it('returns empty array', () => {
    expect(evaluateAlerts(emptySnapshot())).toHaveLength(0)
  })
})

// ── Multiple rules fire in one pass ──────────────────────────────────────────

describe('multiple rules in one snapshot', () => {
  it('returns alerts from different rules simultaneously', () => {
    const snapshot = emptySnapshot({
      roles: [
        {
          id: 'role-x',
          title: 'Infra Lead',
          status: 'OPEN',
          priority: 'HIGH',
          requiredCount: 1,
          filledCount: 0,
          hrOwnerId: 'hr-x',
          targetClosureDate: daysAgo(2),
          createdAt: daysAgo(10),
          shortlistedCount: 0,
          activeApplicationCount: 0,
        },
      ],
      overdueFollowUps: [{ communicationId: 'comm-x', ownerId: 'hr-x' }],
    })
    const alerts = evaluateAlerts(snapshot)
    const types = alerts.map((a) => a.type)
    expect(types).toContain('ROLE_NO_SHORTLIST')
    expect(types).toContain('HIGH_PRIORITY_ROLE_DELAYED')
    expect(types).toContain('CANDIDATE_UNRESPONSIVE')
  })
})
