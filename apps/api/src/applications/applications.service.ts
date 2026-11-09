import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { ApplicationStatus, ScreeningInput, CandidateJourney, CampaignFunnel } from '@picode-hr/shared'
import { PrismaService } from '../prisma/prisma.service'
import { SCREENING, type ScreeningService } from '../ai/screening/screening.service'
import { computeFunnel } from './funnel.helper'

// Maps terminal stage keys to ApplicationStatus values
const TERMINAL_STATUS_MAP: Record<string, ApplicationStatus> = {
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
  JOINED: 'HIRED',
}

@Injectable()
export class ApplicationsService {
  constructor(
    private prisma: PrismaService,
    @Inject(SCREENING) private screening: ScreeningService,
  ) {}

  async create(input: { candidateId: string; roleId: string }) {
    const { candidateId, roleId } = input

    const cvReceived = await this.prisma.pipelineStage.findUnique({
      where: { key: 'CV_RECEIVED' },
    })
    if (!cvReceived) {
      throw new BadRequestException('Pipeline stage CV_RECEIVED not found — run seed first')
    }

    try {
      const application = await this.prisma.application.create({
        data: {
          candidateId,
          roleId,
          currentStageId: cvReceived.id,
        },
      })

      // Record initial transition: null → CV_RECEIVED
      await this.prisma.stageTransition.create({
        data: {
          applicationId: application.id,
          fromStageId: null,
          toStageId: cvReceived.id,
        },
      })

      return application
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('Candidate already applied to this role')
      }
      throw err
    }
  }

  async getById(id: string) {
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: {
        candidate: true,
        role: true,
        currentStage: true,
        transitions: { orderBy: { at: 'asc' } },
      },
    })
    if (!application) throw new NotFoundException(`Application ${id} not found`)
    return application
  }

  list(filters: {
    roleId?: string
    candidateId?: string
    stageKey?: string
    status?: ApplicationStatus
    skip?: number
    take?: number
  }) {
    const { roleId, candidateId, stageKey, status, skip, take } = filters
    return this.prisma.application.findMany({
      skip,
      take: take ?? 50,
      orderBy: { createdAt: 'desc' },
      where: {
        ...(roleId && { roleId }),
        ...(candidateId && { candidateId }),
        ...(status && { status }),
        ...(stageKey && { currentStage: { key: stageKey } }),
      },
      include: { currentStage: true, candidate: true, role: true },
    })
  }

  async moveStage(id: string, toStageKey: string, byUserId?: string) {
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: { currentStage: true },
    })
    if (!application) throw new NotFoundException(`Application ${id} not found`)

    const targetStage = await this.prisma.pipelineStage.findUnique({
      where: { key: toStageKey },
    })
    if (!targetStage) throw new BadRequestException(`Unknown stage key: ${toStageKey}`)

    // Determine new status based on terminal stage
    const newStatus: ApplicationStatus =
      targetStage.isTerminal && TERMINAL_STATUS_MAP[toStageKey]
        ? TERMINAL_STATUS_MAP[toStageKey]
        : application.status

    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        currentStageId: targetStage.id,
        status: newStatus,
      },
      include: { currentStage: true, candidate: true, role: true, transitions: true },
    })

    await this.prisma.stageTransition.create({
      data: {
        applicationId: id,
        fromStageId: application.currentStageId ?? null,
        toStageId: targetStage.id,
        byUserId: byUserId ?? null,
      },
    })

    return updated
  }

  async bulkMove(applicationIds: string[], toStageKey: string, byUserId?: string) {
    let count = 0
    for (const appId of applicationIds) {
      try {
        await this.moveStage(appId, toStageKey, byUserId)
        count++
      } catch {
        // skip individual failures (not-found / bad stage); caller gets count moved
      }
    }
    return { count }
  }

  async reject(id: string, reason: string, byUserId?: string) {
    const application = await this.prisma.application.findUnique({ where: { id } })
    if (!application) throw new NotFoundException(`Application ${id} not found`)

    const rejectedStage = await this.prisma.pipelineStage.findUnique({
      where: { key: 'REJECTED' },
    })

    await this.prisma.application.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason,
        ...(rejectedStage && { currentStageId: rejectedStage.id }),
      },
    })

    if (rejectedStage) {
      await this.prisma.stageTransition.create({
        data: {
          applicationId: id,
          fromStageId: application.currentStageId ?? null,
          toStageId: rejectedStage.id,
          byUserId: byUserId ?? null,
        },
      })
    }

    return this.getById(id)
  }

  async runScreening(id: string) {
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: {
        candidate: {
          include: {
            cvFiles: {
              orderBy: { uploadedAt: 'desc' },
              take: 1,
              select: { status: true, parsedJson: true },
            },
          },
        },
        role: { include: { seniority: true } },
      },
    })
    if (!application) throw new NotFoundException(`Application ${id} not found`)

    const { candidate, role } = application
    const latestCv = candidate.cvFiles[0]
    if (latestCv && (latestCv.status !== 'PARSED' || latestCv.parsedJson == null)) {
      const message =
        latestCv.status === 'FAILED'
          ? 'CV parsing failed. Upload the CV again before screening.'
          : latestCv.status === 'PARSED'
            ? 'CV profile data is unavailable. Upload the CV again before screening.'
            : 'CV is still being processed. Try screening again when parsing is complete.'
      throw new ConflictException(message)
    }

    const input: ScreeningInput = {
      candidate: {
        skills: candidate.skills,
        yearsExperience: candidate.yearsExperience ?? undefined,
        seniority: undefined, // Candidate does not carry a seniority level directly
        location: candidate.location ?? undefined,
      },
      role: {
        requiredSkills: role.requiredSkills,
        preferredSkills: role.preferredSkills,
        requiredYearsExperience: role.requiredYearsExperience ?? undefined,
        seniority: role.seniority?.name ?? undefined,
        location: role.location ?? undefined,
      },
    }

    const result = await this.screening.score(input)

    await this.prisma.application.update({
      where: { id },
      data: {
        matchScore: result.matchScore,
        screeningSummary: result.summary,
      },
    })

    return result
  }

  async pipelineForRole(roleId: string) {
    const stages = await this.prisma.pipelineStage.findMany({ orderBy: { order: 'asc' } })
    const applications = await this.prisma.application.findMany({
      where: { roleId },
      include: { currentStage: true, candidate: true },
    })

    const columns: Record<string, typeof applications> = {}
    for (const stage of stages) {
      columns[stage.key] = []
    }
    for (const app of applications) {
      const key = app.currentStage?.key
      if (key && key in columns) {
        columns[key].push(app)
      }
    }

    return {
      stages: stages.map(({ key, label, order }) => ({ key, label, order })),
      columns,
    }
  }

  /**
   * Computes average time (ms) spent per stage across all applications for a role.
   * Strategy: for each application, walk its transitions in chronological order.
   * Time "in stage X" = time from transition-into-X until the next transition out.
   * The last stage has no exit transition, so its duration is not counted (open-ended).
   */
  async stageDurations(roleId: string) {
    const applications = await this.prisma.application.findMany({
      where: { roleId },
      include: {
        transitions: { orderBy: { at: 'asc' } },
        currentStage: true,
      },
    })

    // stageId → list of durations in ms
    const durations: Record<string, number[]> = {}

    for (const app of applications) {
      const transitions = app.transitions
      for (let i = 0; i < transitions.length - 1; i++) {
        const entry = transitions[i]
        const exit = transitions[i + 1]
        const stageId = entry.toStageId
        if (!stageId) continue
        const durationMs = exit.at.getTime() - entry.at.getTime()
        if (!durations[stageId]) durations[stageId] = []
        durations[stageId].push(durationMs)
      }
    }

    const stageMap = await this.prisma.pipelineStage.findMany({ orderBy: { order: 'asc' } })
    return stageMap.map((stage) => {
      const list = durations[stage.id] ?? []
      const avgMs = list.length > 0 ? list.reduce((a, b) => a + b, 0) / list.length : null
      return { key: stage.key, label: stage.label, order: stage.order, avgDurationMs: avgMs, sampleCount: list.length }
    })
  }

  /**
   * Returns the full candidate journey aggregate for a single application.
   * Loads: application core fields, candidate, role+project, currentStage,
   * transitions (asc), interviews+feedback (asc scheduledAt), offer.
   * Then resolves interviewer names by fetching User rows for all interviewerIds.
   */
  async journey(applicationId: string): Promise<CandidateJourney> {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        candidate: true,
        role: { include: { project: true } },
        currentStage: true,
        transitions: { orderBy: { at: 'asc' } },
        interviews: {
          orderBy: { scheduledAt: 'asc' },
          include: { feedback: true },
        },
        offer: true,
      },
    })

    if (!application) throw new NotFoundException(`Application ${applicationId} not found`)

    // Collect all unique interviewer IDs across all interviews
    const allInterviewerIds = [
      ...new Set(application.interviews.flatMap((iv) => iv.interviewerIds)),
    ]

    // Fetch interviewer user records (id, name, email, role)
    const users =
      allInterviewerIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: allInterviewerIds } },
            select: { id: true, name: true, email: true, role: true },
          })
        : []

    const userMap = new Map(users.map((u) => [u.id, u]))

    // Attach interviewers array to each interview
    const interviews = application.interviews.map((iv) => ({
      ...iv,
      interviewers: iv.interviewerIds.map((uid) => {
        const user = userMap.get(uid)
        return { id: uid, name: user?.name ?? uid }
      }),
    }))

    const { candidate, role, currentStage, transitions, offer } = application

    return {
      application: {
        id: application.id,
        candidateId: application.candidateId,
        roleId: application.roleId,
        currentStageId: application.currentStageId,
        matchScore: application.matchScore,
        screeningSummary: application.screeningSummary,
        hrRecommendation: application.hrRecommendation,
        status: application.status,
        rejectionReason: application.rejectionReason,
        createdAt: application.createdAt,
      },
      candidate: {
        id: candidate.id,
        name: candidate.name,
        email: candidate.email,
        phone: candidate.phone,
        address: candidate.address,
        location: candidate.location,
        currentCompany: candidate.currentCompany,
        currentRole: candidate.currentRole,
        yearsExperience: candidate.yearsExperience,
        skills: candidate.skills,
        linkedinUrl: candidate.linkedinUrl,
        cvUrl: candidate.cvUrl ?? null,
      },
      role: {
        id: role.id,
        title: role.title,
        project: role.project
          ? { id: role.project.id, name: role.project.name, client: role.project.client }
          : null,
      },
      currentStage: currentStage ?? null,
      transitions,
      interviews,
      offer: offer ?? null,
    }
  }

  /**
   * Returns the campaign funnel for a role using persisted screening,
   * interview, feedback, and offer activity.
   */
  async funnel(roleId: string): Promise<CampaignFunnel> {
    const role = await this.prisma.roleReq.findUnique({ where: { id: roleId } })
    if (!role) throw new NotFoundException(`Role ${roleId} not found`)

    const applications = await this.prisma.application.findMany({
      where: { roleId },
      include: {
        currentStage: true,
        interviews: {
          select: {
            stageKey: true,
            status: true,
            feedback: { select: { recommendation: true } },
          },
        },
        offer: { select: { status: true } },
      },
    })

    return {
      roleId,
      ...computeFunnel(applications),
    }
  }
}
