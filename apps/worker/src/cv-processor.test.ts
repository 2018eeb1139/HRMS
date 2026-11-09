import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CvProcessor } from './cv-processor'

const makePrisma = (cvFile: unknown) => ({
  cvFile: {
    findUnique: vi.fn().mockResolvedValue(cvFile),
    update: vi.fn().mockResolvedValue(cvFile),
  },
})

const makeStorage = (buf: Buffer) => ({
  get: vi.fn().mockResolvedValue(buf),
})

const makeExtract = (text: string) => vi.fn().mockResolvedValue(text)

describe('CvProcessor', () => {
  describe('happy path', () => {
    it('sets status PARSING then PARSED with extracted text', async () => {
      const cvFile = {
        id: 'cv-1',
        storageKey: 'cvs/cand-1/file.pdf',
        mimeType: 'application/pdf',
        status: 'UPLOADED',
      }
      const prisma = makePrisma(cvFile)
      const buf = Buffer.from('pdf-content')
      const storage = makeStorage(buf)
      const extract = makeExtract('Hello World extracted text')

      const processor = new CvProcessor(prisma as any, storage, extract)
      await processor.process('cv-1')

      // findUnique called with correct id and candidate include (for enrichment)
      expect(prisma.cvFile.findUnique).toHaveBeenCalledWith({
        where: { id: 'cv-1' },
        include: { candidate: true },
      })

      // first update: PARSING
      expect(prisma.cvFile.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'cv-1' },
        data: { status: 'PARSING' },
      })

      // storage.get called with storageKey
      expect(storage.get).toHaveBeenCalledWith('cvs/cand-1/file.pdf')

      // extract called with buffer and mimeType
      expect(extract).toHaveBeenCalledWith(buf, 'application/pdf')

      // second update: PARSED with parsedText
      expect(prisma.cvFile.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'cv-1' },
        data: { parsedText: 'Hello World extracted text', status: 'PARSED' },
      })
    })

    it('parses structured CV data and enriches empty candidate fields', async () => {
      const cvFile = {
        id: 'cv-structured',
        candidateId: 'cand-structured',
        storageKey: 'cvs/cand-structured/file.pdf',
        mimeType: 'application/pdf',
        candidate: {
          currentRole: null,
          currentCompany: null,
          yearsExperience: null,
          skills: [],
          certifications: [],
          education: null,
          location: null,
          phone: null,
          phoneNormalized: null,
        },
      }
      const prisma = {
        cvFile: {
          findUnique: vi.fn().mockResolvedValue(cvFile),
          update: vi.fn().mockResolvedValue(cvFile),
        },
        candidate: {
          update: vi.fn().mockResolvedValue(undefined),
        },
      }
      const storage = makeStorage(Buffer.from('pdf-content'))
      const extract = makeExtract('Extracted CV text')
      const parsed = {
        phone: '+44 7700 900000',
        skills: ['TypeScript', 'Node.js'],
        totalYearsExperience: 5,
        certifications: [],
        previousCompanies: [],
      }
      const structuredParse = vi.fn().mockResolvedValue(parsed)

      const processor = new CvProcessor(
        prisma as any,
        storage,
        extract,
        structuredParse,
      )
      await processor.process('cv-structured')

      expect(structuredParse).toHaveBeenCalledWith('Extracted CV text')
      expect(prisma.cvFile.update).toHaveBeenLastCalledWith({
        where: { id: 'cv-structured' },
        data: {
          parsedText: 'Extracted CV text',
          status: 'PARSED',
          parsedJson: parsed,
        },
      })
      expect(prisma.candidate.update).toHaveBeenCalledWith({
        where: { id: 'cand-structured' },
        data: {
          phone: '+44 7700 900000',
          phoneNormalized: '447700900000',
          yearsExperience: 5,
          skills: ['TypeScript', 'Node.js'],
        },
      })
    })
  })

  describe('extract throws', () => {
    it('updates CvFile to FAILED and rethrows', async () => {
      const cvFile = {
        id: 'cv-2',
        storageKey: 'cvs/cand-2/resume.pdf',
        mimeType: 'application/pdf',
        status: 'UPLOADED',
      }
      const prisma = makePrisma(cvFile)
      const storage = makeStorage(Buffer.from('data'))
      const extractError = new Error('PDF parse failed')
      const extract = vi.fn().mockRejectedValue(extractError)

      const processor = new CvProcessor(prisma as any, storage, extract)

      await expect(processor.process('cv-2')).rejects.toThrow('PDF parse failed')

      // PARSING set before attempt
      expect(prisma.cvFile.update).toHaveBeenCalledWith({
        where: { id: 'cv-2' },
        data: { status: 'PARSING' },
      })

      // FAILED set after error
      expect(prisma.cvFile.update).toHaveBeenCalledWith({
        where: { id: 'cv-2' },
        data: { status: 'FAILED' },
      })
    })
  })

  describe('structured parse throws', () => {
    it('updates CvFile to FAILED and rethrows', async () => {
      const cvFile = {
        id: 'cv-parse-failed',
        storageKey: 'cvs/cand-1/resume.pdf',
        mimeType: 'application/pdf',
        status: 'UPLOADED',
      }
      const prisma = makePrisma(cvFile)
      const storage = makeStorage(Buffer.from('data'))
      const extract = makeExtract('Extracted CV text')
      const parseError = new Error('Structured CV parsing failed')
      const structuredParse = vi.fn().mockRejectedValue(parseError)

      const processor = new CvProcessor(
        prisma as any,
        storage,
        extract,
        structuredParse,
      )

      await expect(processor.process('cv-parse-failed')).rejects.toThrow(
        'Structured CV parsing failed',
      )
      expect(prisma.cvFile.update).toHaveBeenCalledWith({
        where: { id: 'cv-parse-failed' },
        data: { status: 'FAILED' },
      })
      expect(prisma.cvFile.update).not.toHaveBeenCalledWith({
        where: { id: 'cv-parse-failed' },
        data: expect.objectContaining({ status: 'PARSED' }),
      })
    })
  })

  describe('storage.get throws', () => {
    it('updates CvFile to FAILED and rethrows', async () => {
      const cvFile = {
        id: 'cv-3',
        storageKey: 'cvs/cand-3/resume.pdf',
        mimeType: 'application/pdf',
        status: 'UPLOADED',
      }
      const prisma = makePrisma(cvFile)
      const storageError = new Error('File not found on disk')
      const storage = { get: vi.fn().mockRejectedValue(storageError) }
      const extract = vi.fn()

      const processor = new CvProcessor(prisma as any, storage, extract)

      await expect(processor.process('cv-3')).rejects.toThrow('File not found on disk')

      expect(prisma.cvFile.update).toHaveBeenCalledWith({
        where: { id: 'cv-3' },
        data: { status: 'FAILED' },
      })
    })
  })

  describe('missing CvFile', () => {
    it('throws a not-found error and does not call update', async () => {
      const prisma = makePrisma(null) // findUnique returns null
      const storage = makeStorage(Buffer.from(''))
      const extract = makeExtract('')

      const processor = new CvProcessor(prisma as any, storage, extract)

      await expect(processor.process('cv-missing')).rejects.toThrow(/not found/i)

      expect(prisma.cvFile.update).not.toHaveBeenCalled()
    })
  })
})
