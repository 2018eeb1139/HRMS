import type { PrismaClient } from '@prisma/client'
import { evaluateAlerts } from '@picode-hr/shared'
import type { AlertSnapshot, RaisedAlert } from '@picode-hr/shared'

export interface Notifier {
  notify(userId: string, message: string): Promise<void>
}

/** Default notifier — logs the email it WOULD send. Real email is deferred. */
export class LogNotifier implements Notifier {
  async notify(userId: string, message: string): Promise<void> {
    console.log(`[alert-sweep] WOULD EMAIL userId=${userId}: ${message}`)
  }
}

export class AlertSweeper {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notifier: Notifier = new LogNotifier(),
  ) {}

  async sweep(now: Date): Promise<void> {
    const snapshot = await this.buildSnapshot(now)
    const alerts = evaluateAlerts(snapshot)
    if (alerts.length === 0) return

    const inserted = await this.persistWithDedup(alerts)
    for (const alert of inserted) {
      await this.notifier.notify(alert.userId, alert.message)
    }
  }

  // ── Snapshot builder ──────────────────────────────────────────────────────

  private async buildSnapshot(now: Date): Promise<AlertSnapshot> {
    const nowIso = now.toISOString()

    // Roles with shortlist + active-application counts
    const rawRoles = await this.prisma.roleReq.findMany({
      where: {
        status: { notIn: ['CANCELLED', 'CLOSED'] },
      },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        requiredCount: true,
        filledCount: true,
        hrOwnerId: true,
        targetClosureDate: true,
        createdAt: true,
        _count: {
          select: {
            applications: true,
          },
        },
      },
    })

    // Per-role shortlisted count: applications whose current stage key contains 'SHORTLIST'
    // We do a grouped count via application query
    const shortlistCounts = await this.prisma.application.groupBy({
      by: ['roleId'],
      where: {
        currentStage: { key: { contains: 'SHORTLIST' } },
      },
      _count: { id: true },
    })
    const shortlistMap = new Map(shortlistCounts.map((r) => [r.roleId, r._count.id]))

    const roles: AlertSnapshot['roles'] = rawRoles.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      priority: r.priority,
      requiredCount: r.requiredCount,
      filledCount: r.filledCount,
      hrOwnerId: r.hrOwnerId,
      targetClosureDate: r.targetClosureDate?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      shortlistedCount: shortlistMap.get(r.id) ?? 0,
      activeApplicationCount: r._count.applications,
    }))

    // Completed interviews with feedback counts
    const rawInterviews = await this.prisma.interview.findMany({
      where: { status: 'COMPLETED' },
      select: {
        id: true,
        applicationId: true,
        scheduledAt: true,
        interviewerIds: true,
        application: {
          select: { role: { select: { hrOwnerId: true } } },
        },
        _count: { select: { feedback: true } },
      },
    })

    const completedInterviews: AlertSnapshot['completedInterviews'] = rawInterviews.map((iv) => ({
      id: iv.id,
      applicationId: iv.applicationId,
      scheduledAt: iv.scheduledAt.toISOString(),
      hrOwnerId: iv.application.role.hrOwnerId,
      interviewerIds: iv.interviewerIds,
      feedbackCount: iv._count.feedback,
    }))

    // Selected (HIRED status) applications without an offer record
    const selectedNoOffer = await this.prisma.application.findMany({
      where: { status: 'HIRED', offer: null },
      select: {
        id: true,
        role: { select: { hrOwnerId: true } },
      },
    })

    const selectedWithoutOffer: AlertSnapshot['selectedWithoutOffer'] = selectedNoOffer.map(
      (a) => ({
        applicationId: a.id,
        hrOwnerId: a.role.hrOwnerId,
      }),
    )

    // Projects starting within the next 30 days (generous window; engine applies real threshold)
    const windowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const rawProjects = await this.prisma.project.findMany({
      where: {
        startDate: { gte: now, lte: windowEnd },
        status: { notIn: ['CANCELLED', 'COMPLETED'] },
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        projectManagerId: true,
        roles: {
          where: { status: { notIn: ['CANCELLED', 'CLOSED', 'FILLED'] } },
          select: { requiredCount: true, filledCount: true },
        },
      },
    })

    const projectsStartingSoon: AlertSnapshot['projectsStartingSoon'] = rawProjects
      .map((p) => ({
        id: p.id,
        name: p.name,
        startDate: p.startDate!.toISOString(),
        projectManagerId: p.projectManagerId,
        gap: p.roles.reduce((sum, r) => sum + Math.max(0, r.requiredCount - r.filledCount), 0),
      }))

    // Joiners (ACCEPTED/JOINED offers) with pending docs within 30-day window
    const joiningWindowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const rawOffers = await this.prisma.offer.findMany({
      where: {
        status: { in: ['ACCEPTED', 'JOINED'] },
        confirmedJoiningDate: { gte: now, lte: joiningWindowEnd },
      },
      select: {
        id: true,
        confirmedJoiningDate: true,
        documentsPending: true,
        application: {
          select: { role: { select: { hrOwnerId: true } } },
        },
      },
    })

    const joiners: AlertSnapshot['joiners'] = rawOffers
      .filter((o) => o.confirmedJoiningDate != null)
      .map((o) => ({
        offerId: o.id,
        hrOwnerId: o.application.role.hrOwnerId,
        joiningDate: o.confirmedJoiningDate!.toISOString(),
        documentsPending: o.documentsPending,
      }))

    // Overdue follow-ups: followUpDate is in the past and still unresolved
    const rawFollowUps = await this.prisma.communicationLog.findMany({
      where: {
        followUpDate: { lt: now },
        nextAction: { not: null },
      },
      select: {
        id: true,
        ownerId: true,
      },
    })

    const overdueFollowUps: AlertSnapshot['overdueFollowUps'] = rawFollowUps.map((f) => ({
      communicationId: f.id,
      ownerId: f.ownerId,
    }))

    return {
      now: nowIso,
      roles,
      completedInterviews,
      selectedWithoutOffer,
      projectsStartingSoon,
      joiners,
      overdueFollowUps,
    }
  }

  // ── Dedup + persist ───────────────────────────────────────────────────────

  private async persistWithDedup(alerts: RaisedAlert[]): Promise<RaisedAlert[]> {
    // Find existing unread notifications for same (userId, type, entityId)
    const existing = await this.prisma.notification.findMany({
      where: {
        readAt: null,
        OR: alerts.map((a) => ({
          userId: a.userId,
          type: a.type,
          entityId: a.entityId ?? null,
        })),
      },
      select: { userId: true, type: true, entityId: true },
    })

    const existingSet = new Set(
      existing.map((e) => `${e.userId}|${e.type}|${e.entityId ?? ''}`),
    )

    const toInsert = alerts.filter(
      (a) => !existingSet.has(`${a.userId}|${a.type}|${a.entityId ?? ''}`),
    )

    if (toInsert.length === 0) return []

    await this.prisma.notification.createMany({
      data: toInsert.map((a) => ({
        userId: a.userId,
        type: a.type,
        entityType: a.entityType ?? null,
        entityId: a.entityId ?? null,
        message: a.message,
      })),
    })

    return toInsert
  }
}
