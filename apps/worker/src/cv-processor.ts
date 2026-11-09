import type { PrismaClient } from '@prisma/client'
import { normalizeCandidatePhone } from '@picode-hr/shared'
import type { ParsedCv } from '@picode-hr/shared'

interface Storage {
  get(key: string): Promise<Buffer>
}

type ExtractFn = (buf: Buffer, mimeType: string) => Promise<string>
type StructuredParseFn = (text: string) => Promise<ParsedCv>

/**
 * Build a candidate update payload from ParsedCv, but only include fields
 * that are currently null/empty on the candidate — never overwrite existing data.
 */
function buildCandidateEnrichment(
  candidate: {
    currentRole: string | null
    currentCompany: string | null
    yearsExperience: number | null
    skills: string[]
    certifications: string[]
    education: string | null
    location: string | null
    phone: string | null
  },
  parsed: ParsedCv,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}

  if (!candidate.currentRole && parsed.currentTitle) patch.currentRole = parsed.currentTitle
  if (!candidate.currentCompany && parsed.currentEmployer)
    patch.currentCompany = parsed.currentEmployer
  if (candidate.yearsExperience == null && parsed.totalYearsExperience != null)
    patch.yearsExperience = parsed.totalYearsExperience
  if (candidate.skills.length === 0 && parsed.skills.length > 0) patch.skills = parsed.skills
  if (candidate.certifications.length === 0 && parsed.certifications.length > 0)
    patch.certifications = parsed.certifications
  if (!candidate.education && parsed.education) patch.education = parsed.education
  if (!candidate.location && parsed.location) patch.location = parsed.location
  if (!candidate.phone && parsed.phone) {
    patch.phone = parsed.phone
    patch.phoneNormalized = normalizeCandidatePhone(parsed.phone)
  }

  return patch
}

export class CvProcessor {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: Storage,
    private readonly extract: ExtractFn,
    private readonly structuredParse?: StructuredParseFn,
  ) {}

  async process(cvFileId: string): Promise<void> {
    const cvFile = await this.prisma.cvFile.findUnique({
      where: { id: cvFileId },
      include: { candidate: true },
    })

    if (!cvFile) {
      throw new Error(`CvFile not found: ${cvFileId}`)
    }

    await this.prisma.cvFile.update({ where: { id: cvFileId }, data: { status: 'PARSING' } })

    try {
      const buffer = await this.storage.get(cvFile.storageKey)
      const parsedText = await this.extract(buffer, cvFile.mimeType)

      // Parse structured fields before marking the CV as ready for screening.
      let parsedJson: ParsedCv | null = null
      if (this.structuredParse) {
        parsedJson = await this.structuredParse(parsedText)
      }

      await this.prisma.cvFile.update({
        where: { id: cvFileId },
        data: {
          parsedText,
          status: 'PARSED',
          ...(parsedJson !== null && { parsedJson }),
        },
      })

      // Enrich candidate with extracted fields — only fill empty/null fields
      if (parsedJson !== null) {
        const patch = buildCandidateEnrichment(cvFile.candidate, parsedJson)
        if (Object.keys(patch).length > 0) {
          await this.prisma.candidate.update({
            where: { id: cvFile.candidateId },
            data: patch,
          })
        }
      }
    } catch (err) {
      await this.prisma.cvFile.update({ where: { id: cvFileId }, data: { status: 'FAILED' } })
      throw err
    }
  }
}
