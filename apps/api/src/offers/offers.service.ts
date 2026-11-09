import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { CreateOffer, UpdateOffer, OfferStatus } from '@picode-hr/shared'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'
import { OfferLetterPdfService } from './offer-letter-pdf.service'

// ── Headcount counting helper ─────────────────────────────────────────────────

/**
 * Determines whether an offer status counts toward the filled headcount,
 * given the org-level headcountCountsOn setting.
 *
 * mode = OFFER_ACCEPTED : ACCEPTED and JOINED both count
 * mode = JOINED         : only JOINED counts
 */
function isCounting(status: OfferStatus, mode: 'OFFER_ACCEPTED' | 'JOINED'): boolean {
  if (mode === 'OFFER_ACCEPTED') {
    return status === 'ACCEPTED' || status === 'JOINED'
  }
  return status === 'JOINED'
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class OffersService {
  constructor(
    private prisma: PrismaService,
    private rolesService: RolesService,
    private offerLetterPdfService: OfferLetterPdfService,
  ) {}

  async create(input: CreateOffer) {
    const application = await this.prisma.application.findUnique({
      where: { id: input.applicationId },
      include: { candidate: true },
    })
    if (!application) {
      throw new NotFoundException(`Application ${input.applicationId} not found`)
    }
    this.assertOfferLetterCandidateDetails(application.candidate)
    if (!Number.isFinite(Number(input.offeredSalary)) || Number(input.offeredSalary) <= 0) {
      throw new BadRequestException('Offered annual CTC must be a positive amount')
    }

    try {
      return await this.prisma.offer.create({
        data: {
          applicationId: input.applicationId,
          offeredSalary: input.offeredSalary,
          offerDate: input.offerDate ?? new Date(),
          expectedJoiningDate: input.expectedJoiningDate,
          noticePeriod: input.noticePeriod,
          documentsPending: input.documentsPending ?? [],
          notes: input.notes ?? null,
        },
      })
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('An offer already exists for this application')
      }
      throw err
    }
  }

  async getById(id: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id },
      include: {
        application: {
          include: { role: true },
        },
      },
    })
    if (!offer) throw new NotFoundException(`Offer ${id} not found`)
    return offer
  }

  async generateOfferLetter(id: string): Promise<Buffer> {
    const offer = await this.prisma.offer.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            candidate: true,
            role: { select: { title: true } },
          },
        },
      },
    })
    if (!offer) throw new NotFoundException(`Offer ${id} not found`)

    const { candidate, role } = offer.application
    this.assertOfferLetterCandidateDetails(candidate)
    if (!offer.offeredSalary || !offer.expectedJoiningDate || !offer.noticePeriod) {
      throw new BadRequestException(
        'Offer salary, expected joining date, and notice period are required to generate the offer letter',
      )
    }

    return this.offerLetterPdfService.render({
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      candidatePhone: candidate.phone,
      candidateAddress: candidate.address,
      roleTitle: role.title,
      annualCtc: offer.offeredSalary,
      offerDate: offer.offerDate ?? offer.createdAt,
      joiningDate: offer.expectedJoiningDate,
      noticePeriod: offer.noticePeriod,
    })
  }

  private assertOfferLetterCandidateDetails(candidate: {
    name: string
    email: string | null
    phone: string | null
    address: string | null
  }): asserts candidate is {
    name: string
    email: string
    phone: string
    address: string
  } {
    const missing = [
      !candidate.email?.trim() && 'email',
      !candidate.phone?.trim() && 'phone number',
      !candidate.address?.trim() && 'full residential address',
    ].filter((field): field is string => Boolean(field))

    if (missing.length > 0) {
      throw new BadRequestException(
        `Update the candidate profile with ${missing.join(', ')} before creating the offer`,
      )
    }
  }

  async update(id: string, input: UpdateOffer) {
    await this.getById(id)
    return this.prisma.offer.update({ where: { id }, data: input })
  }

  async setStatus(id: string, newStatus: OfferStatus) {
    const offer = await this.prisma.offer.findUnique({
      where: { id },
      include: { application: true },
    })
    if (!offer) throw new NotFoundException(`Offer ${id} not found`)

    const roleId = offer.application.roleId
    const oldStatus = offer.status as OfferStatus

    // Read org headcount mode — default to OFFER_ACCEPTED if singleton missing
    const setting = await this.prisma.orgSetting.findUnique({ where: { id: 'singleton' } })
    const mode: 'OFFER_ACCEPTED' | 'JOINED' = setting?.headcountCountsOn ?? 'OFFER_ACCEPTED'

    const was = isCounting(oldStatus, mode)
    const now = isCounting(newStatus, mode)

    if (!was && now) {
      await this.rolesService.incrementFilled(roleId)
    } else if (was && !now) {
      await this.rolesService.decrementFilled(roleId)
    }
    // was && now → no change (already counting, still counting)
    // !was && !now → no change (never counted)

    return this.prisma.offer.update({ where: { id }, data: { status: newStatus } })
  }

  async joiningTracker() {
    const offers = await this.prisma.offer.findMany({
      where: {
        status: { in: ['ACCEPTED', 'JOINED'] },
        OR: [
          { expectedJoiningDate: { not: null } },
          { confirmedJoiningDate: { not: null } },
        ],
      },
      orderBy: [
        { confirmedJoiningDate: 'asc' },
        { expectedJoiningDate: 'asc' },
      ],
      include: {
        application: {
          include: {
            candidate: true,
            role: {
              include: { project: true },
            },
          },
        },
      },
    })

    return offers.map((offer) => ({
      offerId: offer.id,
      candidateName: offer.application.candidate.name,
      roleTitle: offer.application.role.title,
      projectName: offer.application.role.project?.name ?? null,
      joiningDate: offer.confirmedJoiningDate ?? offer.expectedJoiningDate,
      offerStatus: offer.status,
      documentsPending: offer.documentsPending,
      joiningRisk: offer.joiningRisk,
    }))
  }

  list(filters: { status?: OfferStatus; skip?: number; take?: number }) {
    const { status, skip, take } = filters
    return this.prisma.offer.findMany({
      skip,
      take: take ?? 50,
      orderBy: { createdAt: 'desc' },
      where: {
        ...(status && { status }),
      },
      include: {
        application: {
          include: { candidate: true, role: true },
        },
      },
    })
  }
}
