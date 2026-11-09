import { describe, it, expect, vi } from 'vitest'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { CandidatesService } from './candidates.service'
import { CvService } from './cv.service'

const makeCandidate = (overrides = {}) => ({
  id: 'cand1',
  name: 'Alice Smith',
  email: 'alice@example.com',
  phone: null,
  phoneNormalized: null,
  address: null,
  location: null,
  currentCompany: null,
  currentRole: null,
  yearsExperience: null,
  skills: [],
  education: null,
  certifications: [],
  noticePeriod: null,
  expectedSalary: null,
  currentSalary: null,
  linkedinUrl: null,
  portfolioUrl: null,
  source: 'HR_UPLOAD',
  tags: [],
  createdAt: new Date(),
  ...overrides,
})

const makeCvFile = (overrides = {}) => ({
  id: 'cv1',
  candidateId: 'cand1',
  storageKey: 'cvs/cand1/123-resume.pdf',
  originalName: 'resume.pdf',
  mimeType: 'application/pdf',
  parsedText: null,
  parsedJson: null,
  status: 'UPLOADED',
  uploadedAt: new Date(),
  ...overrides,
})

const makeCandidatesService = (
  prisma: unknown,
  storage = { delete: vi.fn().mockResolvedValue(undefined) },
) => new CandidatesService(prisma as never, storage as never)

// ── CandidatesService ──────────────────────────────────────────────────────

describe('CandidatesService', () => {
  describe('create', () => {
    it('succeeds when no phone provided', async () => {
      const candidate = makeCandidate({ email: null })
      const prisma = { candidate: { create: vi.fn().mockResolvedValue(candidate) } }
      const svc = makeCandidatesService(prisma)
      const result = await svc.create({ name: 'Alice Smith', skills: [], certifications: [], tags: [] })
      expect(result.name).toBe('Alice Smith')
      expect(prisma.candidate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ phoneNormalized: null }),
      })
    })

    it('stores a normalized phone number without checking email uniqueness', async () => {
      const candidate = makeCandidate({ phoneNormalized: '15551234567' })
      const prisma = { candidate: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(candidate) } }
      const svc = makeCandidatesService(prisma)
      const result = await svc.create({
        name: 'Alice Smith',
        email: 'alice@example.com',
        phone: '+1 (555) 123-4567',
        skills: [],
        certifications: [],
        tags: [],
      })
      expect(result.email).toBe('alice@example.com')
      expect(prisma.candidate.findUnique).toHaveBeenCalledWith({
        where: { phoneNormalized: '15551234567' },
      })
      expect(prisma.candidate.findUnique).toHaveBeenCalledTimes(1)
      expect(prisma.candidate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ phoneNormalized: '15551234567' }),
      })
    })

    it('throws ConflictException when the normalized phone already exists', async () => {
      const existing = makeCandidate()
      const prisma = { candidate: { findUnique: vi.fn().mockResolvedValue(existing), create: vi.fn() } }
      const svc = makeCandidatesService(prisma)
      await expect(
        svc.create({
          name: 'Duplicate',
          phone: '1555.123.4567',
          skills: [],
          certifications: [],
          tags: [],
        }),
      ).rejects.toThrow('A candidate with this phone number already exists.')
      expect(prisma.candidate.create).not.toHaveBeenCalled()
    })

    it('converts a concurrent phone uniqueness violation to ConflictException', async () => {
      const prisma = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockRejectedValue({
            code: 'P2002',
            meta: { target: ['phoneNormalized'] },
          }),
        },
      }
      const svc = makeCandidatesService(prisma)

      await expect(
        svc.create({
          name: 'Duplicate',
          phone: '+1 555 123 4567',
          skills: [],
          certifications: [],
          tags: [],
        }),
      ).rejects.toThrow(ConflictException)
    })
  })

  describe('getById', () => {
    it('returns candidate with cvFiles when found', async () => {
      const candidate = { ...makeCandidate(), cvFiles: [] }
      const prisma = { candidate: { findUnique: vi.fn().mockResolvedValue(candidate) } }
      const svc = makeCandidatesService(prisma)
      const result = await svc.getById('cand1')
      expect(result.id).toBe('cand1')
      expect(prisma.candidate.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'cand1' }, include: { cvFiles: true } }),
      )
    })

    it('throws NotFoundException when candidate is missing', async () => {
      const prisma = { candidate: { findUnique: vi.fn().mockResolvedValue(null) } }
      const svc = makeCandidatesService(prisma)
      await expect(svc.getById('missing')).rejects.toThrow(NotFoundException)
    })
  })

  describe('update', () => {
    it('rejects a phone number already assigned to another candidate', async () => {
      const current = makeCandidate({ id: 'cand-current' })
      const other = makeCandidate({ id: 'cand-other' })
      const prisma = {
        candidate: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(current)
            .mockResolvedValueOnce(other),
          update: vi.fn(),
        },
      }
      const svc = makeCandidatesService(prisma)

      await expect(
        svc.update('cand-current', { phone: '+1 (555) 123-4567' }),
      ).rejects.toThrow('A candidate with this phone number already exists.')
      expect(prisma.candidate.update).not.toHaveBeenCalled()
    })
  })

  describe('delete', () => {
    it('deletes an existing candidate', async () => {
      const candidate = makeCandidate({
        cvFiles: [{ storageKey: 'cvs/cand1/resume.pdf' }],
      })
      const storage = { delete: vi.fn().mockResolvedValue(undefined) }
      const prisma = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue(candidate),
          delete: vi.fn().mockResolvedValue(candidate),
        },
      }
      const svc = makeCandidatesService(prisma, storage)

      await expect(svc.delete('cand1')).resolves.toEqual(candidate)
      expect(storage.delete).toHaveBeenCalledWith('cvs/cand1/resume.pdf')
      expect(prisma.candidate.delete).toHaveBeenCalledWith({
        where: { id: 'cand1' },
      })
    })

    it('does not delete the candidate if a resume file cannot be removed', async () => {
      const candidate = makeCandidate({
        cvFiles: [{ storageKey: 'cvs/cand1/resume.pdf' }],
      })
      const storage = {
        delete: vi.fn().mockRejectedValue(new Error('Storage unavailable')),
      }
      const prisma = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue(candidate),
          delete: vi.fn(),
        },
      }
      const svc = makeCandidatesService(prisma, storage)

      await expect(svc.delete('cand1')).rejects.toThrow('Storage unavailable')
      expect(prisma.candidate.delete).not.toHaveBeenCalled()
    })

    it('does not delete a missing candidate', async () => {
      const prisma = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue(null),
          delete: vi.fn(),
        },
      }
      const svc = makeCandidatesService(prisma)

      await expect(svc.delete('missing')).rejects.toThrow(NotFoundException)
      expect(prisma.candidate.delete).not.toHaveBeenCalled()
    })
  })

  describe('list', () => {
    it('passes q filter as OR contains on name and email', async () => {
      const prisma = { candidate: { findMany: vi.fn().mockResolvedValue([]) } }
      const svc = makeCandidatesService(prisma)
      await svc.list({ q: 'alice' })
      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'alice', mode: 'insensitive' } },
              { email: { contains: 'alice', mode: 'insensitive' } },
            ],
          }),
        }),
      )
    })

    it('passes source filter when provided', async () => {
      const prisma = { candidate: { findMany: vi.fn().mockResolvedValue([]) } }
      const svc = makeCandidatesService(prisma)
      await svc.list({ source: 'LINKEDIN' })
      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ source: 'LINKEDIN' }) }),
      )
    })

    it('defaults take to 50', async () => {
      const prisma = { candidate: { findMany: vi.fn().mockResolvedValue([]) } }
      const svc = makeCandidatesService(prisma)
      await svc.list({})
      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      )
    })
  })
})

// ── CvService ──────────────────────────────────────────────────────────────

describe('CvService', () => {
  it('throws NotFoundException when candidate does not exist', async () => {
    const prisma = { candidate: { findUnique: vi.fn().mockResolvedValue(null) }, cvFile: { create: vi.fn() } }
    const storage = { put: vi.fn(), get: vi.fn() }
    const queue = { add: vi.fn() }
    const svc = new CvService(prisma as never, storage as never, queue as never)
    await expect(
      svc.uploadCv('missing', { buffer: Buffer.from('x'), originalname: 'cv.pdf', mimetype: 'application/pdf' }),
    ).rejects.toThrow(NotFoundException)
  })

  it('calls STORAGE.put, creates CvFile with status UPLOADED, and enqueues a parse job', async () => {
    const candidate = makeCandidate()
    const cvFile = makeCvFile()
    const prisma = {
      candidate: { findUnique: vi.fn().mockResolvedValue(candidate) },
      cvFile: { create: vi.fn().mockResolvedValue(cvFile) },
    }
    const storage = { put: vi.fn().mockResolvedValue(undefined), get: vi.fn() }
    const queue = { add: vi.fn().mockResolvedValue(undefined) }
    const svc = new CvService(prisma as never, storage as never, queue as never)

    const result = await svc.uploadCv('cand1', {
      buffer: Buffer.from('pdf bytes'),
      originalname: 'resume.pdf',
      mimetype: 'application/pdf',
    })

    expect(storage.put).toHaveBeenCalledWith(
      expect.stringContaining('cvs/cand1/'),
      expect.any(Buffer),
      'application/pdf',
    )
    expect(prisma.cvFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ candidateId: 'cand1', status: 'UPLOADED', originalName: 'resume.pdf' }),
      }),
    )
    expect(queue.add).toHaveBeenCalledWith('parse', { cvFileId: cvFile.id })
    expect(result.status).toBe('UPLOADED')
  })
})
