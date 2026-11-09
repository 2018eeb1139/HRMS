import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ProjectsService } from '../projects/projects.service'
import { OffersService } from '../offers/offers.service'
import { FeedbackService } from '../feedback/feedback.service'
import { roleRisk, headcountTotals, gapAnalysis } from './aggregations'
import type { GapRole, GapApplication } from './aggregations'

// ── Constants ─────────────────────────────────────────────────────────────────

const AI_STRONG_MATCH_THRESHOLD = 75
const SHORTLISTED_STAGE_KEY = 'SHORTLISTED'
const PAST_CLOSURE_FILTER_STATUSES = ['OPEN', 'IN_PROGRESS', 'ON_HOLD'] as const

// ── DashboardsService ─────────────────────────────────────────────────────────

@Injectable()
export class DashboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly offersService: OffersService,
    private readonly feedbackService: FeedbackService,
  ) {}

  // ── executive ──────────────────────────────────────────────────────────────

  async executive() {
    const now = new Date()

    const roles = await this.prisma.roleReq.findMany({
      orderBy: { createdAt: 'desc' },
    })

    const totals = headcountTotals(roles)

    const highPriorityRoles = roles.filter(
      (r) => (r.priority === 'HIGH' || r.priority === 'CRITICAL') && r.status !== 'CANCELLED' && r.status !== 'CLOSED',
    )

    const highRiskRoles = roles.filter((r) => roleRisk(r, now) === 'HIGH')

    const offersInProgress = await this.prisma.offer.count({
      where: { status: { in: ['SENT', 'UNDER_NEGOTIATION', 'ACCEPTED'] } },
    })

    const joiningTrackerData = await this.offersService.joiningTracker()
    const upcomingJoiners = joiningTrackerData.length

    const delayedRoles = roles.filter((r) => {
      if (!PAST_CLOSURE_FILTER_STATUSES.includes(r.status as typeof PAST_CLOSURE_FILTER_STATUSES[number])) return false
      if (!r.targetClosureDate) return false
      const gap = r.requiredCount - r.filledCount
      return gap > 0 && r.targetClosureDate < now
    })

    const projects = await this.prisma.project.findMany({ select: { id: true, name: true } })
    const projectStaffingRisks = await Promise.all(
      projects.map(async (p) => {
        const summary = await this.projectsService.staffingSummary(p.id)
        return { projectId: p.id, projectName: p.name, ...summary }
      }),
    )

    return {
      openRoles: totals.openRoles,
      requiredPositions: totals.requiredPositions,
      filledPositions: totals.filledPositions,
      gap: totals.gap,
      highPriorityRoles: highPriorityRoles.map((r) => ({
        roleId: r.id,
        title: r.title,
        priority: r.priority,
        status: r.status,
        gap: r.requiredCount - r.filledCount,
      })),
      highRiskRoles: highRiskRoles.map((r) => ({
        roleId: r.id,
        title: r.title,
        risk: roleRisk(r, now),
        targetClosureDate: r.targetClosureDate,
        gap: r.requiredCount - r.filledCount,
      })),
      offersInProgress,
      upcomingJoiners,
      delayedRoles: delayedRoles.map((r) => ({
        roleId: r.id,
        title: r.title,
        targetClosureDate: r.targetClosureDate,
        gap: r.requiredCount - r.filledCount,
      })),
      projectStaffingRisks,
    }
  }

  // ── hrOps ──────────────────────────────────────────────────────────────────

  async hrOps() {
    const now = new Date()

    const cvsPendingReview = await this.prisma.cvFile.count({
      where: { status: 'PARSED' },
    })

    const stages = await this.prisma.pipelineStage.findMany({ orderBy: { order: 'asc' } })
    const candidatesPerStage: Record<string, number> = {}
    for (const stage of stages) {
      candidatesPerStage[stage.key] = await this.prisma.application.count({
        where: { currentStageId: stage.id, status: 'ACTIVE' },
      })
    }

    const interviewsScheduled = await this.prisma.interview.count({
      where: { status: 'SCHEDULED' },
    })

    const feedbackTracking = await this.feedbackService.tracking()
    const feedbackPending = feedbackTracking.pending

    const offersPending = await this.prisma.offer.count({
      where: { status: { in: ['TO_BE_PREPARED', 'SENT'] } },
    })

    const followUpsDue = await this.prisma.communicationLog.count({
      where: {
        followUpDate: { lte: now },
      },
    })

    const shortlistedStage = await this.prisma.pipelineStage.findUnique({
      where: { key: SHORTLISTED_STAGE_KEY },
    })

    let rolesWithNoShortlist: number
    if (shortlistedStage) {
      // Open roles that have no applications at or past the SHORTLISTED stage
      const openRoles = await this.prisma.roleReq.findMany({
        where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
        select: { id: true },
      })
      const roleIds = openRoles.map((r) => r.id)

      const rolesWithShortlistedApps = await this.prisma.application.groupBy({
        by: ['roleId'],
        where: {
          roleId: { in: roleIds },
          currentStage: { order: { gte: shortlistedStage.order } },
        },
      })
      const shortlistedRoleIds = new Set(rolesWithShortlistedApps.map((r) => r.roleId))
      rolesWithNoShortlist = roleIds.filter((id) => !shortlistedRoleIds.has(id)).length
    } else {
      rolesWithNoShortlist = 0
    }

    return {
      cvsPendingReview,
      candidatesPerStage,
      interviewsScheduled,
      feedbackPending,
      offersPending,
      followUpsDue,
      rolesWithNoShortlist,
    }
  }

  // ── projectStaffing ────────────────────────────────────────────────────────

  async projectStaffing() {
    const projects = await this.prisma.project.findMany({
      select: { id: true, name: true },
      orderBy: { createdAt: 'desc' },
    })

    return Promise.all(
      projects.map(async (p) => {
        const summary = await this.projectsService.staffingSummary(p.id)
        return { projectId: p.id, projectName: p.name, ...summary }
      }),
    )
  }

  // ── roleLevel ──────────────────────────────────────────────────────────────

  async roleLevel(roleId: string) {
    const now = new Date()

    const role = await this.prisma.roleReq.findUniqueOrThrow({ where: { id: roleId } })

    const applications = await this.prisma.application.findMany({
      where: { roleId },
      include: {
        currentStage: true,
        offer: true,
        interviews: { include: { feedback: { select: { id: true } } } },
      },
    })

    const remainingCount = Math.max(0, role.requiredCount - role.filledCount)

    const cvsUploaded = await this.prisma.cvFile.count({
      where: { candidate: { applications: { some: { roleId } } } },
    })

    const aiStrongMatches = applications.filter(
      (a) => (a.matchScore ?? 0) >= AI_STRONG_MATCH_THRESHOLD,
    ).length

    const shortlistedStage = await this.prisma.pipelineStage.findUnique({
      where: { key: SHORTLISTED_STAGE_KEY },
    })
    const shortlisted = shortlistedStage
      ? applications.filter(
          (a) => a.currentStage && a.currentStage.order >= shortlistedStage.order,
        ).length
      : 0

    const interviewsCompleted = await this.prisma.interview.count({
      where: { application: { roleId }, status: 'COMPLETED' },
    })

    const offersInProgress = await this.prisma.offer.count({
      where: {
        application: { roleId },
        status: { in: ['SENT', 'UNDER_NEGOTIATION', 'ACCEPTED'] },
      },
    })

    const expectedJoiners = await this.prisma.offer.count({
      where: {
        application: { roleId },
        status: { in: ['ACCEPTED', 'JOINED'] },
      },
    })

    const daysOpen = Math.floor(
      (now.getTime() - role.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    )

    const risk = roleRisk(role, now)

    return {
      requiredCount: role.requiredCount,
      filledCount: role.filledCount,
      remainingCount,
      cvsUploaded,
      aiStrongMatches,
      shortlisted,
      interviewsCompleted,
      offersInProgress,
      expectedJoiners,
      daysOpen,
      targetClosureDate: role.targetClosureDate,
      risk,
    }
  }

  // ── joiningTracker ─────────────────────────────────────────────────────────

  joiningTracker() {
    return this.offersService.joiningTracker()
  }

  // ── gapAnalysis ────────────────────────────────────────────────────────────

  async gapAnalysis() {
    const now = new Date()

    const roles = await this.prisma.roleReq.findMany({
      include: {
        project: { select: { startDate: true } },
        applications: {
          include: {
            currentStage: { select: { key: true, order: true } },
            offer: { select: { status: true } },
            interviews: {
              select: {
                id: true,
                status: true,
                feedback: { select: { id: true } },
              },
            },
          },
        },
      },
    })

    // Map Prisma rows to the pure GapRole shape
    const gapRoles: GapRole[] = roles.map((r) => ({
      id: r.id,
      requiredCount: r.requiredCount,
      filledCount: r.filledCount,
      status: r.status,
      targetJoiningDate: r.targetJoiningDate,
      targetClosureDate: r.targetClosureDate,
      project: r.project ? { startDate: r.project.startDate } : null,
      applications: r.applications.map((a): GapApplication => ({
        id: a.id,
        roleId: r.id,
        matchScore: a.matchScore,
        currentStage: a.currentStage
          ? { key: a.currentStage.key, order: a.currentStage.order }
          : null,
        status: a.status,
        offer: a.offer ? { status: a.offer.status } : null,
        interviews: a.interviews.map((iv) => ({
          id: iv.id,
          status: iv.status,
          feedback: iv.feedback.map((fb) => ({ id: fb.id })),
        })),
      })),
    }))

    return gapAnalysis(gapRoles, now)
  }
}
