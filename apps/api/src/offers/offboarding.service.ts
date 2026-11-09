import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { CreateOffboarding, UpdateOffboarding } from '@picode-hr/shared'
import { PrismaService } from '../prisma/prisma.service'
import { RelievingLetterPdfService } from './relieving-letter-pdf.service'

@Injectable()
export class OffboardingService {
  constructor(
    private prisma: PrismaService,
    private relievingLetterPdf: RelievingLetterPdfService,
  ) {}

  async tracker() {
    const offers = await this.prisma.offer.findMany({
      where: { status: 'JOINED' },
      orderBy: [{ confirmedJoiningDate: 'desc' }, { expectedJoiningDate: 'desc' }],
      include: {
        application: {
          include: {
            candidate: true,
            role: { include: { project: true, department: true } },
          },
        },
        offboarding: true,
      },
    })

    return offers.map((offer) => ({
      offerId: offer.id,
      candidateName: offer.application.candidate.name,
      roleTitle: offer.application.role.title,
      projectName: offer.application.role.project?.name ?? null,
      departmentName: offer.application.role.department?.name ?? null,
      joiningDate: offer.confirmedJoiningDate ?? offer.expectedJoiningDate,
      offboarding: offer.offboarding,
    }))
  }

  async create(offerId: string, input: CreateOffboarding) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      select: { id: true, status: true },
    })
    if (!offer) throw new NotFoundException(`Offer ${offerId} not found`)
    if (offer.status !== 'JOINED') {
      throw new BadRequestException('Only joined candidates can be offboarded')
    }

    try {
      return await this.prisma.offboarding.create({
        data: {
          offerId,
          lastWorkingDate: input.lastWorkingDate,
          assetsIssued: input.assetsIssued,
        },
      })
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('Offboarding has already been started for this candidate')
      }
      throw error
    }
  }

  async update(offerId: string, input: UpdateOffboarding) {
    const offboarding = await this.getByOfferId(offerId)
    if (offboarding.settlementStartedAt) {
      throw new BadRequestException('Offboarding checkpoints cannot change after F&F starts')
    }
    if (input.assetsReturned && !offboarding.assetsIssued) {
      throw new BadRequestException('No company assets were recorded for return')
    }

    return this.prisma.offboarding.update({
      where: { offerId },
      data: input,
    })
  }

  async startSettlement(offerId: string, hrUserId: string): Promise<Buffer> {
    const offboarding = await this.prisma.offboarding.findUnique({
      where: { offerId },
      include: {
        offer: {
          include: {
            application: {
              include: {
                candidate: true,
                role: { include: { department: true } },
              },
            },
          },
        },
      },
    })
    if (!offboarding) throw new NotFoundException('Offboarding has not been started')
    if (offboarding.settlementStatus === 'COMPLETED') {
      throw new BadRequestException('F&F settlement has already been completed')
    }
    if (
      !offboarding.knowledgeTransferCompleted ||
      !offboarding.managerApprovalReceived ||
      (offboarding.assetsIssued && !offboarding.assetsReturned)
    ) {
      throw new BadRequestException(
        'Complete KT, manager approval, and any required asset return before starting F&F',
      )
    }

    const { candidate, role } = offboarding.offer.application
    const joiningDate =
      offboarding.offer.confirmedJoiningDate ?? offboarding.offer.expectedJoiningDate
    if (!joiningDate) {
      throw new BadRequestException(
        'A confirmed or expected joining date is required to generate the relieving letter',
      )
    }

    const hrUser = await this.prisma.user.findUnique({
      where: { id: hrUserId },
      select: { id: true, name: true, role: true },
    })
    if (!hrUser) throw new NotFoundException('Logged-in HR user was not found')

    const pdf = await this.relievingLetterPdf.render({
      candidateName: candidate.name,
      employeeId: 'Not assigned',
      designation: role.title,
      department: role.department?.name ?? 'Not specified',
      joiningDate,
      lastWorkingDate: offboarding.lastWorkingDate,
      hrName: hrUser.name,
      hrTitle: hrUser.role === 'HR' ? 'HR Manager' : 'Authorized Signatory',
    })

    if (!offboarding.settlementStartedAt) {
      await this.prisma.offboarding.update({
        where: { offerId },
        data: {
          settlementStartedAt: new Date(),
          settlementStatus: 'IN_PROGRESS',
        },
      })
    }

    return pdf
  }

  async completeSettlement(offerId: string) {
    const offboarding = await this.getByOfferId(offerId)
    if (offboarding.settlementStatus !== 'IN_PROGRESS') {
      throw new BadRequestException('F&F settlement must be in progress before it can be completed')
    }

    return this.prisma.offboarding.update({
      where: { offerId },
      data: { settlementStatus: 'COMPLETED' },
    })
  }

  private async getByOfferId(offerId: string) {
    const offboarding = await this.prisma.offboarding.findUnique({ where: { offerId } })
    if (!offboarding) throw new NotFoundException('Offboarding has not been started')
    return offboarding
  }
}
