import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { CommunicationsService } from './communications.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeLog = (overrides: Record<string, unknown> = {}) => ({
  id: 'log-1',
  candidateId: 'cand-1',
  applicationId: null,
  type: 'EMAIL' as const,
  ownerId: 'user-1',
  summary: 'Called the candidate',
  candidateResponse: null,
  nextAction: null,
  followUpDate: null,
  attachmentKey: null,
  createdAt: new Date('2026-06-09T10:00:00Z'),
  candidate: { id: 'cand-1', name: 'Alice' },
  owner: { id: 'user-1', name: 'HR Jane', email: 'jane@picode.com', role: 'HR' },
  ...overrides,
})

const makePrisma = (overrides: Record<string, unknown> = {}) => ({
  communicationLog: {
    create: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  ...overrides,
})

// ── create ────────────────────────────────────────────────────────────────────

describe('CommunicationsService.create', () => {
  it('persists log with ownerId and all provided fields', async () => {
    const log = makeLog()
    const prisma = makePrisma()
    prisma.communicationLog.create = vi.fn().mockResolvedValue(log)

    const svc = new CommunicationsService(prisma as never)
    const result = await svc.create(
      {
        candidateId: 'cand-1',
        type: 'EMAIL',
        summary: 'Called the candidate',
      },
      'user-1',
    )

    expect(prisma.communicationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        candidateId: 'cand-1',
        type: 'EMAIL',
        summary: 'Called the candidate',
        ownerId: 'user-1',
        applicationId: null,
      }),
    })
    expect(result.id).toBe('log-1')
    expect(result.ownerId).toBe('user-1')
  })

  it('stores optional fields when provided', async () => {
    const followUpDate = new Date('2026-06-20T10:00:00Z')
    const log = makeLog({ followUpDate, applicationId: 'app-1', nextAction: 'Send offer' })
    const prisma = makePrisma()
    prisma.communicationLog.create = vi.fn().mockResolvedValue(log)

    const svc = new CommunicationsService(prisma as never)
    await svc.create(
      {
        candidateId: 'cand-1',
        applicationId: 'app-1',
        type: 'PHONE',
        summary: 'Discussed role',
        nextAction: 'Send offer',
        followUpDate,
      },
      'user-1',
    )

    expect(prisma.communicationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        applicationId: 'app-1',
        nextAction: 'Send offer',
        followUpDate,
      }),
    })
  })
})

// ── list — followUpsDue ───────────────────────────────────────────────────────

describe('CommunicationsService.list — followUpsDue', () => {
  it('filters by followUpDate lte now and orders asc when followUpsDue=true', async () => {
    const prisma = makePrisma()
    prisma.communicationLog.findMany = vi.fn().mockResolvedValue([])

    const svc = new CommunicationsService(prisma as never)
    const before = new Date()
    await svc.list({ followUpsDue: true })
    const after = new Date()

    expect(prisma.communicationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { followUpDate: 'asc' },
        where: expect.objectContaining({
          followUpDate: expect.objectContaining({
            lte: expect.any(Date),
          }),
        }),
      }),
    )

    // Verify the lte date is between before and after (i.e. is approximately now)
    const call = (prisma.communicationLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const lteDate: Date = call.where.followUpDate.lte
    expect(lteDate.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(lteDate.getTime()).toBeLessThanOrEqual(after.getTime())
  })

  it('orders by createdAt desc and has no followUpDate filter when followUpsDue=false', async () => {
    const prisma = makePrisma()
    prisma.communicationLog.findMany = vi.fn().mockResolvedValue([])

    const svc = new CommunicationsService(prisma as never)
    await svc.list({ followUpsDue: false })

    expect(prisma.communicationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
      }),
    )

    const call = (prisma.communicationLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.where.followUpDate).toBeUndefined()
  })
})

// ── list — by candidateId ─────────────────────────────────────────────────────

describe('CommunicationsService.list — candidateId filter', () => {
  it('passes candidateId in where clause', async () => {
    const prisma = makePrisma()
    prisma.communicationLog.findMany = vi.fn().mockResolvedValue([])

    const svc = new CommunicationsService(prisma as never)
    await svc.list({ candidateId: 'cand-42' })

    expect(prisma.communicationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ candidateId: 'cand-42' }),
      }),
    )
  })

  it('does not include candidateId in where when not provided', async () => {
    const prisma = makePrisma()
    prisma.communicationLog.findMany = vi.fn().mockResolvedValue([])

    const svc = new CommunicationsService(prisma as never)
    await svc.list({})

    const call = (prisma.communicationLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.where.candidateId).toBeUndefined()
  })

  it('applies default take=50 when not specified', async () => {
    const prisma = makePrisma()
    prisma.communicationLog.findMany = vi.fn().mockResolvedValue([])

    const svc = new CommunicationsService(prisma as never)
    await svc.list({})

    expect(prisma.communicationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    )
  })
})

// ── getById ───────────────────────────────────────────────────────────────────

describe('CommunicationsService.getById', () => {
  it('returns log with candidate and owner when found', async () => {
    const log = makeLog()
    const prisma = makePrisma()
    prisma.communicationLog.findUnique = vi.fn().mockResolvedValue(log)

    const svc = new CommunicationsService(prisma as never)
    const result = await svc.getById('log-1')

    expect(result.id).toBe('log-1')
    expect(prisma.communicationLog.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'log-1' } }),
    )
  })

  it('throws NotFoundException when log does not exist', async () => {
    const prisma = makePrisma()
    prisma.communicationLog.findUnique = vi.fn().mockResolvedValue(null)

    const svc = new CommunicationsService(prisma as never)
    await expect(svc.getById('missing')).rejects.toThrow(NotFoundException)
  })
})

// ── update ────────────────────────────────────────────────────────────────────

describe('CommunicationsService.update', () => {
  it('throws NotFoundException when log does not exist', async () => {
    const prisma = makePrisma()
    prisma.communicationLog.findUnique = vi.fn().mockResolvedValue(null)

    const svc = new CommunicationsService(prisma as never)
    await expect(svc.update('missing', { summary: 'new' })).rejects.toThrow(NotFoundException)
  })

  it('calls prisma update with provided fields', async () => {
    const log = makeLog()
    const updated = makeLog({ summary: 'Updated summary' })
    const prisma = makePrisma()
    prisma.communicationLog.findUnique = vi.fn().mockResolvedValue(log)
    prisma.communicationLog.update = vi.fn().mockResolvedValue(updated)

    const svc = new CommunicationsService(prisma as never)
    const result = await svc.update('log-1', { summary: 'Updated summary' })

    expect(prisma.communicationLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'log-1' },
        data: expect.objectContaining({ summary: 'Updated summary' }),
      }),
    )
    expect(result.summary).toBe('Updated summary')
  })
})
