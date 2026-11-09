import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { OffersService } from './offers.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeApplication = (overrides = {}) => ({
  id: 'app1',
  candidateId: 'cand1',
  roleId: 'role1',
  status: 'ACTIVE' as const,
  candidate: {
    id: 'cand1',
    name: 'Alice Smith',
    email: 'alice@example.com',
    phone: '+1 555 123 4567',
    address: '12 Example Street, London',
  },
  role: {
    id: 'role1',
    title: 'Backend Engineer',
    project: { id: 'proj1', name: 'Alpha Project' },
  },
  ...overrides,
})

const makeOffer = (overrides = {}) => ({
  id: 'offer1',
  applicationId: 'app1',
  application: makeApplication(),
  offeredSalary: '80000',
  offerDate: null,
  status: 'TO_BE_PREPARED' as const,
  expectedJoiningDate: new Date('2026-09-01'),
  confirmedJoiningDate: null,
  noticePeriod: null,
  documentsPending: [],
  joiningRisk: null,
  notes: null,
  createdAt: new Date(),
  ...overrides,
})

const makePrisma = (overrides: Record<string, unknown> = {}) => ({
  application: {
    findUnique: vi.fn(),
  },
  offer: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
  },
  orgSetting: {
    findUnique: vi.fn().mockResolvedValue({ id: 'singleton', headcountCountsOn: 'OFFER_ACCEPTED' }),
  },
  roleReq: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  ...overrides,
})

const makeRolesService = () => ({
  incrementFilled: vi.fn().mockResolvedValue({}),
  decrementFilled: vi.fn().mockResolvedValue({}),
})

const makeOfferLetterPdfService = () => ({
  render: vi.fn().mockResolvedValue(Buffer.from('%PDF-')),
})

const makeService = (prismaOverrides = {}, rolesOverrides = {}) => {
  const prisma = makePrisma(prismaOverrides)
  const rolesService = { ...makeRolesService(), ...rolesOverrides }
  const offerLetterPdfService = makeOfferLetterPdfService()
  const svc = new OffersService(
    prisma as never,
    rolesService as never,
    offerLetterPdfService as never,
  )
  return { svc, prisma, rolesService, offerLetterPdfService }
}

const validCreateInput = {
  applicationId: 'app1',
  offeredSalary: '80000',
  expectedJoiningDate: new Date('2026-09-01'),
  noticePeriod: '30 days',
}

// ── create ────────────────────────────────────────────────────────────────────

describe('OffersService.create', () => {
  it('throws NotFoundException if application does not exist', async () => {
    const { svc, prisma } = makeService()
    prisma.application.findUnique.mockResolvedValue(null)

    await expect(
      svc.create({ ...validCreateInput, applicationId: 'missing' }),
    ).rejects.toThrow(NotFoundException)
  })

  it('requires candidate email, phone, and address before creating an offer', async () => {
    const { svc, prisma } = makeService()
    prisma.application.findUnique.mockResolvedValue(
      makeApplication({ candidate: { id: 'cand1', name: 'Alice Smith', email: null, phone: null, address: null } }),
    )

    await expect(svc.create(validCreateInput)).rejects.toThrow(
      'email, phone number, full residential address',
    )
    expect(prisma.offer.create).not.toHaveBeenCalled()
  })

  it('throws ConflictException on P2002 (offer already exists)', async () => {
    const { svc, prisma } = makeService()
    prisma.application.findUnique.mockResolvedValue(makeApplication())
    prisma.offer.create.mockRejectedValue({ code: 'P2002' })

    await expect(svc.create(validCreateInput)).rejects.toThrow(ConflictException)
  })

  it('creates offer with TO_BE_PREPARED status and returns it', async () => {
    const { svc, prisma } = makeService()
    prisma.application.findUnique.mockResolvedValue(makeApplication())
    const created = makeOffer()
    prisma.offer.create.mockResolvedValue(created)

    const result = await svc.create(validCreateInput)

    expect(prisma.offer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ applicationId: 'app1', offeredSalary: '80000' }),
      }),
    )
    expect(result.status).toBe('TO_BE_PREPARED')
  })

  it('creates offer with empty documentsPending when not supplied', async () => {
    const { svc, prisma } = makeService()
    prisma.application.findUnique.mockResolvedValue(makeApplication())
    prisma.offer.create.mockResolvedValue(makeOffer())

    await svc.create(validCreateInput)

    expect(prisma.offer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentsPending: [],
          expectedJoiningDate: validCreateInput.expectedJoiningDate,
          noticePeriod: validCreateInput.noticePeriod,
        }),
      }),
    )
  })
})

describe('OffersService.generateOfferLetter', () => {
  it('renders a PDF from the saved offer and current candidate details', async () => {
    const { svc, prisma, offerLetterPdfService } = makeService()
    prisma.offer.findUnique.mockResolvedValue(
      makeOffer({
        noticePeriod: '30 days',
        offerDate: new Date('2026-11-02T00:00:00Z'),
        expectedJoiningDate: new Date('2026-12-01T00:00:00Z'),
      }),
    )

    const pdf = await svc.generateOfferLetter('offer1')

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(offerLetterPdfService.render).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateName: 'Alice Smith',
        candidateEmail: 'alice@example.com',
        candidatePhone: '+1 555 123 4567',
        candidateAddress: '12 Example Street, London',
        roleTitle: 'Backend Engineer',
        annualCtc: '80000',
        noticePeriod: '30 days',
      }),
    )
  })
})

// ── setStatus — mode OFFER_ACCEPTED ──────────────────────────────────────────

describe('OffersService.setStatus (mode=OFFER_ACCEPTED)', () => {
  const setupWithMode = (oldStatus: string, mode = 'OFFER_ACCEPTED') => {
    const { svc, prisma, rolesService } = makeService()
    prisma.offer.findUnique.mockResolvedValue(
      makeOffer({ status: oldStatus, application: makeApplication() }),
    )
    prisma.orgSetting.findUnique.mockResolvedValue({ id: 'singleton', headcountCountsOn: mode })
    prisma.offer.update.mockResolvedValue(makeOffer({ status: oldStatus }))
    return { svc, prisma, rolesService }
  }

  it('SENT→ACCEPTED: calls incrementFilled once', async () => {
    const { svc, rolesService } = setupWithMode('SENT')
    await svc.setStatus('offer1', 'ACCEPTED')
    expect(rolesService.incrementFilled).toHaveBeenCalledOnce()
    expect(rolesService.incrementFilled).toHaveBeenCalledWith('role1')
    expect(rolesService.decrementFilled).not.toHaveBeenCalled()
  })

  it('ACCEPTED→JOINED: does NOT double-increment (both are counting)', async () => {
    const { svc, rolesService } = setupWithMode('ACCEPTED')
    await svc.setStatus('offer1', 'JOINED')
    expect(rolesService.incrementFilled).not.toHaveBeenCalled()
    expect(rolesService.decrementFilled).not.toHaveBeenCalled()
  })

  it('ACCEPTED→REJECTED: calls decrementFilled once', async () => {
    const { svc, rolesService } = setupWithMode('ACCEPTED')
    await svc.setStatus('offer1', 'REJECTED')
    expect(rolesService.decrementFilled).toHaveBeenCalledOnce()
    expect(rolesService.decrementFilled).toHaveBeenCalledWith('role1')
    expect(rolesService.incrementFilled).not.toHaveBeenCalled()
  })

  it('SENT→UNDER_NEGOTIATION: no-op (neither status counts)', async () => {
    const { svc, rolesService } = setupWithMode('SENT')
    await svc.setStatus('offer1', 'UNDER_NEGOTIATION')
    expect(rolesService.incrementFilled).not.toHaveBeenCalled()
    expect(rolesService.decrementFilled).not.toHaveBeenCalled()
  })

  it('JOINED→REJECTED: calls decrementFilled (was counting, now not)', async () => {
    const { svc, rolesService } = setupWithMode('JOINED')
    await svc.setStatus('offer1', 'REJECTED')
    expect(rolesService.decrementFilled).toHaveBeenCalledOnce()
    expect(rolesService.incrementFilled).not.toHaveBeenCalled()
  })

  it('uses OFFER_ACCEPTED mode when orgSetting is missing (default)', async () => {
    const { svc, prisma, rolesService } = makeService()
    prisma.offer.findUnique.mockResolvedValue(
      makeOffer({ status: 'SENT', application: makeApplication() }),
    )
    // orgSetting missing
    prisma.orgSetting.findUnique.mockResolvedValue(null)
    prisma.offer.update.mockResolvedValue(makeOffer())

    await svc.setStatus('offer1', 'ACCEPTED')
    // Default mode OFFER_ACCEPTED: SENT→ACCEPTED should increment
    expect(rolesService.incrementFilled).toHaveBeenCalledOnce()
  })
})

// ── setStatus — mode JOINED ───────────────────────────────────────────────────

describe('OffersService.setStatus (mode=JOINED)', () => {
  const setupJoinedMode = (oldStatus: string) => {
    const { svc, prisma, rolesService } = makeService()
    prisma.offer.findUnique.mockResolvedValue(
      makeOffer({ status: oldStatus, application: makeApplication() }),
    )
    prisma.orgSetting.findUnique.mockResolvedValue({ id: 'singleton', headcountCountsOn: 'JOINED' })
    prisma.offer.update.mockResolvedValue(makeOffer({ status: oldStatus }))
    return { svc, prisma, rolesService }
  }

  it('ACCEPTED→JOINED: increments (only JOINED counts in this mode)', async () => {
    const { svc, rolesService } = setupJoinedMode('ACCEPTED')
    await svc.setStatus('offer1', 'JOINED')
    expect(rolesService.incrementFilled).toHaveBeenCalledOnce()
    expect(rolesService.incrementFilled).toHaveBeenCalledWith('role1')
    expect(rolesService.decrementFilled).not.toHaveBeenCalled()
  })

  it('SENT→ACCEPTED: no-op (ACCEPTED does not count in JOINED mode)', async () => {
    const { svc, rolesService } = setupJoinedMode('SENT')
    await svc.setStatus('offer1', 'ACCEPTED')
    expect(rolesService.incrementFilled).not.toHaveBeenCalled()
    expect(rolesService.decrementFilled).not.toHaveBeenCalled()
  })

  it('JOINED→ACCEPTED: decrements (was counting, now not)', async () => {
    const { svc, rolesService } = setupJoinedMode('JOINED')
    await svc.setStatus('offer1', 'ACCEPTED')
    expect(rolesService.decrementFilled).toHaveBeenCalledOnce()
    expect(rolesService.decrementFilled).toHaveBeenCalledWith('role1')
    expect(rolesService.incrementFilled).not.toHaveBeenCalled()
  })

  it('SENT→UNDER_NEGOTIATION: no-op', async () => {
    const { svc, rolesService } = setupJoinedMode('SENT')
    await svc.setStatus('offer1', 'UNDER_NEGOTIATION')
    expect(rolesService.incrementFilled).not.toHaveBeenCalled()
    expect(rolesService.decrementFilled).not.toHaveBeenCalled()
  })
})

// ── setStatus — NotFound ──────────────────────────────────────────────────────

describe('OffersService.setStatus — not found', () => {
  it('throws NotFoundException when offer does not exist', async () => {
    const { svc, prisma } = makeService()
    prisma.offer.findUnique.mockResolvedValue(null)
    await expect(svc.setStatus('missing', 'ACCEPTED')).rejects.toThrow(NotFoundException)
  })
})

// ── joiningTracker ────────────────────────────────────────────────────────────

describe('OffersService.joiningTracker', () => {
  it('returns mapped rows for ACCEPTED/JOINED offers', async () => {
    const { svc, prisma } = makeService()
    const acceptedOffer = makeOffer({
      id: 'offer-a',
      status: 'ACCEPTED',
      expectedJoiningDate: new Date('2026-09-01'),
      confirmedJoiningDate: null,
      documentsPending: ['ID Proof'],
      joiningRisk: 'MEDIUM',
      application: {
        candidate: { id: 'cand1', name: 'Alice Smith' },
        role: {
          title: 'Backend Engineer',
          project: { name: 'Alpha Project' },
        },
      },
    })
    const joinedOffer = makeOffer({
      id: 'offer-b',
      status: 'JOINED',
      expectedJoiningDate: new Date('2026-08-15'),
      confirmedJoiningDate: new Date('2026-08-15'),
      documentsPending: [],
      joiningRisk: 'LOW',
      application: {
        candidate: { id: 'cand2', name: 'Bob Jones' },
        role: {
          title: 'Frontend Developer',
          project: null,
        },
      },
    })
    prisma.offer.findMany.mockResolvedValue([acceptedOffer, joinedOffer])

    const result = await svc.joiningTracker()

    expect(result).toHaveLength(2)

    const row1 = result[0]
    expect(row1.offerId).toBe('offer-a')
    expect(row1.candidateName).toBe('Alice Smith')
    expect(row1.roleTitle).toBe('Backend Engineer')
    expect(row1.projectName).toBe('Alpha Project')
    expect(row1.joiningDate).toEqual(new Date('2026-09-01'))
    expect(row1.offerStatus).toBe('ACCEPTED')
    expect(row1.documentsPending).toEqual(['ID Proof'])
    expect(row1.joiningRisk).toBe('MEDIUM')

    const row2 = result[1]
    expect(row2.offerId).toBe('offer-b')
    expect(row2.candidateName).toBe('Bob Jones')
    expect(row2.projectName).toBeNull()
    // confirmedJoiningDate takes precedence over expectedJoiningDate
    expect(row2.joiningDate).toEqual(new Date('2026-08-15'))
  })

  it('returns empty array when no ACCEPTED/JOINED offers with joining dates', async () => {
    const { svc, prisma } = makeService()
    prisma.offer.findMany.mockResolvedValue([])
    const result = await svc.joiningTracker()
    expect(result).toEqual([])
  })
})
