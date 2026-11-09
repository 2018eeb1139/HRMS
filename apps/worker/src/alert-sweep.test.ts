import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AlertSweeper } from './alert-sweep'
import type { Notifier } from './alert-sweep'

// ── Mock factory helpers ──────────────────────────────────────────────────────

const NOW = new Date('2026-06-09T10:00:00.000Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000)
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * 24 * 60 * 60 * 1000)
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000)

function makeFakeNotifier(): Notifier & { calls: Array<{ userId: string; message: string }> } {
  const calls: Array<{ userId: string; message: string }> = []
  return {
    calls,
    async notify(userId, message) {
      calls.push({ userId, message })
    },
  }
}

/**
 * Build a minimal prisma mock with enough surface area for the sweeper.
 * Each method can be overridden per-test via the returned object.
 */
function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    roleReq: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    application: {
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    interview: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    project: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    offer: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    communicationLog: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    notification: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AlertSweeper.sweep', () => {
  describe('no data — no alerts', () => {
    it('calls no createMany when snapshot is empty', async () => {
      const prisma = makePrisma()
      const notifier = makeFakeNotifier()
      const sweeper = new AlertSweeper(prisma as any, notifier)

      await sweeper.sweep(NOW)

      expect(prisma.notification.createMany).not.toHaveBeenCalled()
      expect(notifier.calls).toHaveLength(0)
    })
  })

  describe('ROLE_NO_SHORTLIST alert', () => {
    it('inserts notification and calls notifier when rule fires', async () => {
      const prisma = makePrisma({
        roleReq: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'role-1',
              title: 'Backend Engineer',
              status: 'OPEN',
              priority: 'MEDIUM',
              requiredCount: 1,
              filledCount: 0,
              hrOwnerId: 'hr-user-1',
              targetClosureDate: null,
              createdAt: daysAgo(10),
              _count: { applications: 0 },
            },
          ]),
        },
        notification: {
          findMany: vi.fn().mockResolvedValue([]), // no existing unread
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })

      const notifier = makeFakeNotifier()
      const sweeper = new AlertSweeper(prisma as any, notifier)
      await sweeper.sweep(NOW)

      expect(prisma.notification.createMany).toHaveBeenCalledOnce()
      const createArgs = (prisma.notification.createMany as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as { data: Array<{ type: string; userId: string }> }
      expect(createArgs.data[0].type).toBe('ROLE_NO_SHORTLIST')
      expect(createArgs.data[0].userId).toBe('hr-user-1')
      expect(notifier.calls).toHaveLength(1)
      expect(notifier.calls[0]?.userId).toBe('hr-user-1')
    })
  })

  describe('deduplication', () => {
    it('skips insertion when matching unread notification already exists', async () => {
      const prisma = makePrisma({
        roleReq: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'role-2',
              title: 'Frontend Dev',
              status: 'IN_PROGRESS',
              priority: 'MEDIUM',
              requiredCount: 1,
              filledCount: 0,
              hrOwnerId: 'hr-user-2',
              targetClosureDate: null,
              createdAt: daysAgo(9),
              _count: { applications: 0 },
            },
          ]),
        },
        notification: {
          // simulate existing unread notification for same (userId, type, entityId)
          findMany: vi.fn().mockResolvedValue([
            {
              userId: 'hr-user-2',
              type: 'ROLE_NO_SHORTLIST',
              entityId: 'role-2',
            },
          ]),
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      })

      const notifier = makeFakeNotifier()
      const sweeper = new AlertSweeper(prisma as any, notifier)
      await sweeper.sweep(NOW)

      // createMany should NOT be called (all deduplicated)
      expect(prisma.notification.createMany).not.toHaveBeenCalled()
      expect(notifier.calls).toHaveLength(0)
    })

    it('only inserts the new alert when one of two alerts is already unread', async () => {
      const prisma = makePrisma({
        roleReq: {
          findMany: vi.fn().mockResolvedValue([
            // role-a: already has unread notification
            {
              id: 'role-a',
              title: 'Role A',
              status: 'OPEN',
              priority: 'MEDIUM',
              requiredCount: 1,
              filledCount: 0,
              hrOwnerId: 'hr-1',
              targetClosureDate: null,
              createdAt: daysAgo(10),
              _count: { applications: 0 },
            },
            // role-b: new, no existing notification
            {
              id: 'role-b',
              title: 'Role B',
              status: 'OPEN',
              priority: 'MEDIUM',
              requiredCount: 1,
              filledCount: 0,
              hrOwnerId: 'hr-2',
              targetClosureDate: null,
              createdAt: daysAgo(10),
              _count: { applications: 0 },
            },
          ]),
        },
        notification: {
          findMany: vi.fn().mockResolvedValue([
            // existing unread for role-a only
            { userId: 'hr-1', type: 'ROLE_NO_SHORTLIST', entityId: 'role-a' },
          ]),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })

      const notifier = makeFakeNotifier()
      const sweeper = new AlertSweeper(prisma as any, notifier)
      await sweeper.sweep(NOW)

      expect(prisma.notification.createMany).toHaveBeenCalledOnce()
      const createArgs = (prisma.notification.createMany as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as { data: Array<{ entityId: string }> }
      // Only role-b should be inserted
      expect(createArgs.data).toHaveLength(1)
      expect(createArgs.data[0]?.entityId).toBe('role-b')

      // Notifier only called for role-b
      expect(notifier.calls).toHaveLength(1)
      expect(notifier.calls[0]?.userId).toBe('hr-2')
    })
  })

  describe('FEEDBACK_PENDING_24H alert', () => {
    it('inserts notification for completed interview with no feedback after 24h', async () => {
      const prisma = makePrisma({
        interview: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'iv-1',
              applicationId: 'app-1',
              scheduledAt: hoursAgo(26),
              interviewerIds: ['interviewer-1'],
              application: { role: { hrOwnerId: 'hr-user-3' } },
              _count: { feedback: 0 },
            },
          ]),
        },
        notification: {
          findMany: vi.fn().mockResolvedValue([]),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })

      const notifier = makeFakeNotifier()
      const sweeper = new AlertSweeper(prisma as any, notifier)
      await sweeper.sweep(NOW)

      const createArgs = (prisma.notification.createMany as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as { data: Array<{ type: string }> }
      expect(createArgs.data.some((d) => d.type === 'FEEDBACK_PENDING_24H')).toBe(true)
      expect(notifier.calls.some((c) => c.userId === 'hr-user-3')).toBe(true)
    })
  })

  describe('multiple alerts in one sweep', () => {
    it('creates notifications for all distinct non-deduplicated alerts', async () => {
      const prisma = makePrisma({
        roleReq: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'role-multi',
              title: 'Multi Rule Role',
              status: 'OPEN',
              priority: 'HIGH',
              requiredCount: 1,
              filledCount: 0,
              hrOwnerId: 'hr-multi',
              targetClosureDate: daysAgo(2),
              createdAt: daysAgo(15),
              _count: { applications: 0 },
            },
          ]),
        },
        communicationLog: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'comm-1', ownerId: 'hr-multi' },
          ]),
        },
        notification: {
          findMany: vi.fn().mockResolvedValue([]),
          createMany: vi.fn().mockResolvedValue({ count: 3 }),
        },
      })

      const notifier = makeFakeNotifier()
      const sweeper = new AlertSweeper(prisma as any, notifier)
      await sweeper.sweep(NOW)

      const createArgs = (prisma.notification.createMany as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as { data: Array<{ type: string }> }
      const types = createArgs.data.map((d) => d.type)
      expect(types).toContain('ROLE_NO_SHORTLIST')
      expect(types).toContain('HIGH_PRIORITY_ROLE_DELAYED')
      expect(types).toContain('CANDIDATE_UNRESPONSIVE')
    })
  })
})
