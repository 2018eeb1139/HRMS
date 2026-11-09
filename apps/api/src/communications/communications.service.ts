import { Injectable, NotFoundException } from '@nestjs/common'
import type { CommunicationType, CreateCommunication, UpdateCommunication } from '@picode-hr/shared'
import { PrismaService } from '../prisma/prisma.service'

export interface ListCommunicationsFilter {
  candidateId?: string
  applicationId?: string
  type?: CommunicationType
  followUpsDue?: boolean
  skip?: number
  take?: number
}

@Injectable()
export class CommunicationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateCommunication, ownerId: string) {
    return this.prisma.communicationLog.create({
      data: {
        candidateId: input.candidateId,
        applicationId: input.applicationId ?? null,
        type: input.type,
        ownerId,
        summary: input.summary,
        candidateResponse: input.candidateResponse ?? null,
        nextAction: input.nextAction ?? null,
        followUpDate: input.followUpDate ?? null,
        attachmentKey: input.attachmentKey ?? null,
      },
    })
  }

  list(filters: ListCommunicationsFilter) {
    const { candidateId, applicationId, type, followUpsDue, skip, take } = filters

    const now = new Date()

    return this.prisma.communicationLog.findMany({
      skip,
      take: take ?? 50,
      orderBy: followUpsDue
        ? { followUpDate: 'asc' }
        : { createdAt: 'desc' },
      where: {
        ...(candidateId && { candidateId }),
        ...(applicationId && { applicationId }),
        ...(type && { type }),
        ...(followUpsDue && { followUpDate: { lte: now } }),
      },
      include: {
        candidate: true,
        owner: { select: { id: true, name: true, email: true, role: true } },
      },
    })
  }

  async getById(id: string) {
    const log = await this.prisma.communicationLog.findUnique({
      where: { id },
      include: {
        candidate: true,
        owner: { select: { id: true, name: true, email: true, role: true } },
      },
    })
    if (!log) throw new NotFoundException(`CommunicationLog ${id} not found`)
    return log
  }

  async update(id: string, input: UpdateCommunication) {
    await this.getById(id)
    return this.prisma.communicationLog.update({
      where: { id },
      data: {
        ...(input.candidateId !== undefined && { candidateId: input.candidateId }),
        ...(input.applicationId !== undefined && { applicationId: input.applicationId }),
        ...(input.type !== undefined && { type: input.type }),
        ...(input.summary !== undefined && { summary: input.summary }),
        ...(input.candidateResponse !== undefined && { candidateResponse: input.candidateResponse }),
        ...(input.nextAction !== undefined && { nextAction: input.nextAction }),
        ...(input.followUpDate !== undefined && { followUpDate: input.followUpDate }),
        ...(input.attachmentKey !== undefined && { attachmentKey: input.attachmentKey }),
      },
    })
  }
}
