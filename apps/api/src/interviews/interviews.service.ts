import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { InterviewStatus, RescheduleInterview, ScheduleInterview, SuggestSlots } from '@picode-hr/shared'
import { PrismaService } from '../prisma/prisma.service'
import { STORAGE, type Storage } from '../storage/storage.interface'
import { CALENDAR, type CalendarPort } from './calendar.port'
import { generateIcs } from './ics'

const MAX_SLOTS = 10
const STEP_MIN = 30
const WORKING_HOUR_START = 9   // 09:00 UTC
const WORKING_HOUR_END = 17    // 17:00 UTC

// ── Pure slot math helper ──────────────────────────────────────────────────────

export interface BusyInterval {
  start: string
  end: string
}

/**
 * Given busy intervals and a [from, to] window, return up to MAX_SLOTS
 * candidate slot start-times (ISO strings) where:
 *  - slot falls within working hours (09:00–17:00 UTC)
 *  - [slotStart, slotStart+durationMin] does NOT overlap any busy interval
 * Slots are generated stepping every STEP_MIN minutes.
 */
export function computeFreeSlots(
  busy: BusyInterval[],
  fromISO: string,
  toISO: string,
  durationMin: number,
): string[] {
  const from = new Date(fromISO).getTime()
  const to = new Date(toISO).getTime()
  const durationMs = durationMin * 60 * 1000
  const stepMs = STEP_MIN * 60 * 1000

  const busyMs = busy.map((b) => ({
    start: new Date(b.start).getTime(),
    end: new Date(b.end).getTime(),
  }))

  const slots: string[] = []

  // Start from next STEP_MIN boundary >= from
  let cursor = Math.ceil(from / stepMs) * stepMs

  while (cursor + durationMs <= to && slots.length < MAX_SLOTS) {
    const slotEnd = cursor + durationMs
    const slotDate = new Date(cursor)

    const startHour = slotDate.getUTCHours() + slotDate.getUTCMinutes() / 60
    const endMinutes = cursor + durationMs
    const endDate = new Date(endMinutes)
    const endHour = endDate.getUTCHours() + endDate.getUTCMinutes() / 60

    const inWorkingHours =
      startHour >= WORKING_HOUR_START && endHour <= WORKING_HOUR_END

    if (inWorkingHours) {
      const overlaps = busyMs.some((b) => cursor < b.end && slotEnd > b.start)
      if (!overlaps) {
        slots.push(new Date(cursor).toISOString())
      }
    }

    cursor += stepMs
  }

  return slots
}

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable()
export class InterviewsService {
  private readonly logger = new Logger(InterviewsService.name)

  constructor(
    private prisma: PrismaService,
    @Inject(CALENDAR) private calendar: CalendarPort,
    @Inject(STORAGE) private storage: Storage,
  ) {}

  async schedule(input: ScheduleInterview) {
    const application = await this.prisma.application.findUnique({
      where: { id: input.applicationId },
      include: {
        candidate: {
          select: {
            name: true,
            email: true,
            cvFiles: {
              orderBy: { uploadedAt: 'desc' },
              take: 1,
              select: { storageKey: true, originalName: true, mimeType: true },
            },
          },
        },
        role: { select: { title: true, jobDescription: true, responsibilities: true } },
      },
    })
    if (!application) {
      throw new NotFoundException(`Application ${input.applicationId} not found`)
    }
    if (!application.candidate.email) {
      throw new BadRequestException(
        'Candidate email is required to send an interview invitation',
      )
    }
    const cvFile = application.candidate.cvFiles[0]
    if (!cvFile) {
      throw new BadRequestException(
        'Candidate CV is required to schedule an interview invitation',
      )
    }

    let cvContent: Buffer
    try {
      cvContent = await this.storage.get(cvFile.storageKey)
    } catch (err) {
      this.logger.error(`Unable to retrieve candidate CV: ${String(err)}`)
      throw new ServiceUnavailableException(
        'Unable to retrieve the candidate CV from storage',
      )
    }

    const interviewers = await this.prisma.user.findMany({
      where: { id: { in: input.interviewerIds } },
      select: { id: true, email: true },
    })
    if (interviewers.length !== input.interviewerIds.length) {
      throw new BadRequestException('One or more selected interviewers were not found')
    }
    const icsUid = crypto.randomUUID()

    let resolvedMeetingLink: string | undefined = input.meetingLink

    let calendarResult: { eventId: string; meetingLink?: string }
    try {
      calendarResult = await this.calendar.createEvent({
        summary: `${application.role.title} interview — ${application.candidate.name}`,
        description: [
          `Interview for ${application.role.title}`,
          `Candidate: ${application.candidate.name} (${application.candidate.email})`,
          input.stageKey ? `Interview stage: ${input.stageKey.replace(/_/g, ' ')}` : null,
          application.role.jobDescription
            ? `Job description:\n${application.role.jobDescription}`
            : null,
          application.role.responsibilities
            ? `Key responsibilities:\n${application.role.responsibilities}`
            : null,
          input.meetingLink ? `Meeting link: ${input.meetingLink}` : null,
        ]
          .filter(Boolean)
          .join('\n\n'),
        start: input.scheduledAt,
        durationMin: input.durationMin,
        attendees: [
          application.candidate.email,
          ...interviewers.map((interviewer) => interviewer.email),
        ],
        attachments: [
          {
            fileName: cvFile.originalName,
            mimeType: cvFile.mimeType,
            content: cvContent,
          },
        ],
        icsUid,
      })
    } catch (err) {
      this.logger.error(`calendar.createEvent failed: ${String(err)}`)
      throw new ServiceUnavailableException(
        'Unable to create the calendar invitation. No interview was scheduled.',
      )
    }
    if (calendarResult.meetingLink) resolvedMeetingLink = calendarResult.meetingLink

    try {
      return await this.prisma.interview.create({
        data: {
          applicationId: input.applicationId,
          stageKey: input.stageKey ?? null,
          interviewerIds: input.interviewerIds,
          scheduledAt: input.scheduledAt,
          durationMin: input.durationMin,
          meetingLink: resolvedMeetingLink ?? null,
          icsUid,
          googleEventId: calendarResult.eventId,
          status: 'SCHEDULED',
        },
      })
    } catch (err) {
      this.logger.error(
        `interview.create failed after calendar event ${calendarResult.eventId}: ${String(err)}`,
      )
      try {
        await this.calendar.cancelEvent(calendarResult.eventId)
      } catch (cancelError) {
        this.logger.error(
          `Unable to cancel calendar event ${calendarResult.eventId} after interview.create failed: ${String(cancelError)}`,
        )
      }
      throw err
    }
  }

  async reschedule(id: string, input: RescheduleInterview) {
    const existing = await this.prisma.interview.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException(`Interview ${id} not found`)

    return this.prisma.interview.update({
      where: { id },
      data: {
        scheduledAt: input.scheduledAt,
        ...(input.durationMin !== undefined && { durationMin: input.durationMin }),
        status: 'RESCHEDULED',
      },
    })
  }

  async cancel(id: string) {
    const existing = await this.prisma.interview.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException(`Interview ${id} not found`)

    // Best-effort calendar cancellation
    if (existing.googleEventId) {
      try {
        await this.calendar.cancelEvent(existing.googleEventId)
      } catch (err) {
        this.logger.warn(`calendar.cancelEvent failed for ${existing.googleEventId}: ${String(err)}`)
      }
    }

    return this.prisma.interview.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })
  }

  async setStatus(id: string, status: InterviewStatus) {
    const existing = await this.prisma.interview.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException(`Interview ${id} not found`)

    return this.prisma.interview.update({
      where: { id },
      data: { status },
    })
  }

  async suggestSlots(input: SuggestSlots) {
    const durationMin = input.durationMin ?? 60
    const busy = await this.calendar.freeBusy(input.interviewerIds, input.fromISO, input.toISO)
    return computeFreeSlots(busy, input.fromISO, input.toISO, durationMin)
  }

  async list(filters: {
    applicationId?: string
    interviewerId?: string
    status?: InterviewStatus
  }) {
    const { applicationId, interviewerId, status } = filters
    const interviews = await this.prisma.interview.findMany({
      where: {
        ...(applicationId && { applicationId }),
        ...(interviewerId && { interviewerIds: { has: interviewerId } }),
        ...(status && { status }),
      },
      include: {
        application: {
          select: {
            candidateId: true,
            candidate: { select: { id: true, name: true } },
            currentStage: { select: { label: true } },
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    })

    const interviewerIds = [
      ...new Set(interviews.flatMap((interview) => interview.interviewerIds)),
    ]
    const interviewers = interviewerIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: interviewerIds } },
          select: { id: true, name: true, email: true },
        })
      : []
    const interviewersById = new Map(interviewers.map((user) => [user.id, user]))

    return interviews.map((interview) => ({
      ...interview,
      interviewers: interview.interviewerIds
        .map((id) => interviewersById.get(id) ?? { id }),
    }))
  }

  async getById(id: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id },
      include: { application: true },
    })
    if (!interview) throw new NotFoundException(`Interview ${id} not found`)
    return interview
  }

  generateIcsForInterview(interview: {
    icsUid: string
    scheduledAt: Date
    durationMin: number
    applicationId: string
    meetingLink?: string | null
    interviewerIds: string[]
  }): string {
    return generateIcs({
      uid: interview.icsUid,
      start: interview.scheduledAt,
      durationMin: interview.durationMin,
      summary: `Interview — Application ${interview.applicationId}`,
      location: interview.meetingLink ?? undefined,
      attendees: interview.interviewerIds,
    })
  }
}
