import { describe, expect, it, vi } from 'vitest'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { OffboardingService } from './offboarding.service'

const makeRecord = (overrides = {}) => ({
  id: 'exit1',
  offerId: 'offer1',
  lastWorkingDate: new Date('2026-12-01'),
  knowledgeTransferCompleted: false,
  managerApprovalReceived: false,
  assetsIssued: false,
  assetsReturned: false,
  settlementStartedAt: null,
  settlementStatus: 'NOT_STARTED',
  createdAt: new Date(),
  updatedAt: new Date(),
  offer: {
    confirmedJoiningDate: new Date('2024-06-01'),
    expectedJoiningDate: new Date('2024-06-01'),
    application: {
      candidate: { name: 'Alice Employee', email: 'alice@example.com' },
      role: {
        title: 'Software Engineer',
        department: { name: 'Engineering' },
      },
    },
  },
  ...overrides,
})

const makePrisma = () => ({
  offer: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  offboarding: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
})

describe('OffboardingService', () => {
  const makePdf = () => ({ render: vi.fn().mockResolvedValue(Buffer.from('%PDF-')) })

  it('only starts offboarding for a joined offer', async () => {
    const prisma = makePrisma()
    prisma.offer.findUnique.mockResolvedValue({ id: 'offer1', status: 'ACCEPTED' })
    const service = new OffboardingService(prisma as never, makePdf() as never)

    await expect(
      service.create('offer1', {
        lastWorkingDate: new Date('2026-12-01'),
        assetsIssued: false,
      }),
    ).rejects.toThrow(BadRequestException)
    expect(prisma.offboarding.create).not.toHaveBeenCalled()
  })

  it('returns not found when the offer does not exist', async () => {
    const prisma = makePrisma()
    prisma.offer.findUnique.mockResolvedValue(null)
    const service = new OffboardingService(prisma as never, makePdf() as never)

    await expect(
      service.create('missing', {
        lastWorkingDate: new Date('2026-12-01'),
        assetsIssued: false,
      }),
    ).rejects.toThrow(NotFoundException)
  })

  it('requires KT, manager approval, and issued assets to be returned before F&F', async () => {
    const prisma = makePrisma()
    prisma.offboarding.findUnique.mockResolvedValue(makeRecord({
      knowledgeTransferCompleted: true,
      managerApprovalReceived: true,
      assetsIssued: true,
      assetsReturned: false,
    }))
    const service = new OffboardingService(prisma as never, makePdf() as never)

    await expect(service.startSettlement('offer1', 'hr1')).rejects.toThrow(
      'Complete KT, manager approval, and any required asset return',
    )
    expect(prisma.offboarding.update).not.toHaveBeenCalled()
  })

  it('starts F&F after all applicable checkpoints are complete', async () => {
    const prisma = makePrisma()
    const pdf = makePdf()
    prisma.user.findUnique.mockResolvedValue({ id: 'hr1', name: 'HR Person', role: 'HR' })
    prisma.offboarding.findUnique.mockResolvedValue(makeRecord({
      knowledgeTransferCompleted: true,
      managerApprovalReceived: true,
      assetsIssued: true,
      assetsReturned: true,
    }))
    prisma.offboarding.update.mockImplementation(async ({ data }) =>
      makeRecord({ ...data, settlementStartedAt: data.settlementStartedAt }),
    )
    const service = new OffboardingService(prisma as never, pdf as never)

    const result = await service.startSettlement('offer1', 'hr1')

    expect(result).toEqual(Buffer.from('%PDF-'))
    expect(pdf.render).toHaveBeenCalledWith(expect.objectContaining({
      candidateName: 'Alice Employee',
      employeeId: 'Not assigned',
      designation: 'Software Engineer',
      department: 'Engineering',
      hrName: 'HR Person',
      hrTitle: 'HR Manager',
    }))
    expect(prisma.offboarding.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { offerId: 'offer1' },
        data: {
          settlementStartedAt: expect.any(Date),
          settlementStatus: 'IN_PROGRESS',
        },
      }),
    )
  })

  it('completes an in-progress F&F settlement', async () => {
    const prisma = makePrisma()
    prisma.offboarding.findUnique.mockResolvedValue(
      makeRecord({ settlementStatus: 'IN_PROGRESS' }),
    )
    prisma.offboarding.update.mockResolvedValue(
      makeRecord({ settlementStatus: 'COMPLETED' }),
    )
    const service = new OffboardingService(prisma as never, makePdf() as never)

    await service.completeSettlement('offer1')

    expect(prisma.offboarding.update).toHaveBeenCalledWith({
      where: { offerId: 'offer1' },
      data: { settlementStatus: 'COMPLETED' },
    })
  })

  it('does not complete a settlement that has not started', async () => {
    const prisma = makePrisma()
    prisma.offboarding.findUnique.mockResolvedValue(makeRecord())
    const service = new OffboardingService(prisma as never, makePdf() as never)

    await expect(service.completeSettlement('offer1')).rejects.toThrow(
      'F&F settlement must be in progress before it can be completed',
    )
    expect(prisma.offboarding.update).not.toHaveBeenCalled()
  })

  it('does not generate a settlement letter after F&F is completed', async () => {
    const prisma = makePrisma()
    prisma.offboarding.findUnique.mockResolvedValue(
      makeRecord({ settlementStatus: 'COMPLETED' }),
    )
    const service = new OffboardingService(prisma as never, makePdf() as never)

    await expect(service.startSettlement('offer1', 'hr1')).rejects.toThrow(
      'F&F settlement has already been completed',
    )
    expect(prisma.offboarding.update).not.toHaveBeenCalled()
  })

  it('does not mark F&F started when generating the letter fails', async () => {
    const prisma = makePrisma()
    prisma.offboarding.findUnique.mockResolvedValue(makeRecord({
      knowledgeTransferCompleted: true,
      managerApprovalReceived: true,
    }))
    prisma.user.findUnique.mockResolvedValue({ id: 'hr1', name: 'HR Person', role: 'HR' })
    const pdf = { render: vi.fn().mockRejectedValue(new Error('PDF generation failed')) }
    const service = new OffboardingService(prisma as never, pdf as never)

    await expect(service.startSettlement('offer1', 'hr1')).rejects.toThrow('PDF generation failed')
    expect(prisma.offboarding.update).not.toHaveBeenCalled()
  })

  it('does not allow checkpoints to change after F&F has started', async () => {
    const prisma = makePrisma()
    prisma.offboarding.findUnique.mockResolvedValue(
      makeRecord({ settlementStartedAt: new Date() }),
    )
    const service = new OffboardingService(prisma as never, makePdf() as never)

    await expect(
      service.update('offer1', { knowledgeTransferCompleted: true }),
    ).rejects.toThrow('Offboarding checkpoints cannot change after F&F starts')
    expect(prisma.offboarding.update).not.toHaveBeenCalled()
  })
})
