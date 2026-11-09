import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { normalizeCandidatePhone } from '@picode-hr/shared'
import type { CreateCandidate, UpdateCandidate, CandidateSource } from '@picode-hr/shared'
import { PrismaService } from '../prisma/prisma.service'
import { STORAGE, type Storage } from '../storage/storage.interface'

function isPhoneUniqueConstraintError(error: unknown): boolean {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    error.code !== 'P2002' ||
    !('meta' in error) ||
    typeof error.meta !== 'object' ||
    error.meta === null ||
    !('target' in error.meta)
  ) {
    return false
  }

  const target = error.meta.target
  return Array.isArray(target)
    ? target.includes('phoneNormalized')
    : target === 'phoneNormalized' ||
        target === 'Candidate_phoneNormalized_key'
}

@Injectable()
export class CandidatesService {
  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE) private storage: Storage,
  ) {}

  list(filters: {
    skip?: number
    take?: number
    source?: CandidateSource
    tag?: string
    q?: string
  }) {
    const { skip, take, source, tag, q } = filters
    return this.prisma.candidate.findMany({
      skip,
      take: take ?? 50,
      orderBy: { createdAt: 'desc' },
      where: {
        ...(source && { source }),
        ...(tag && { tags: { has: tag } }),
        ...(q && {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        }),
      },
    })
  }

  async getById(id: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      include: { cvFiles: true },
    })
    if (!candidate) throw new NotFoundException(`Candidate ${id} not found`)
    return candidate
  }

  async create(input: CreateCandidate) {
    const phoneNormalized = normalizeCandidatePhone(input.phone)
    if (phoneNormalized) {
      const existing = await this.prisma.candidate.findUnique({
        where: { phoneNormalized },
      })
      if (existing) {
        throw new ConflictException(
          'A candidate with this phone number already exists.',
        )
      }
    }

    try {
      return await this.prisma.candidate.create({
        data: { ...input, phoneNormalized },
      })
    } catch (error) {
      if (isPhoneUniqueConstraintError(error)) {
        throw new ConflictException(
          'A candidate with this phone number already exists.',
        )
      }
      throw error
    }
  }

  async update(id: string, input: UpdateCandidate) {
    await this.getById(id)
    if (input.phone === undefined) {
      return this.prisma.candidate.update({ where: { id }, data: input })
    }

    const phoneNormalized = normalizeCandidatePhone(input.phone)
    if (phoneNormalized) {
      const existing = await this.prisma.candidate.findUnique({
        where: { phoneNormalized },
      })
      if (existing && existing.id !== id) {
        throw new ConflictException(
          'A candidate with this phone number already exists.',
        )
      }
    }

    try {
      return await this.prisma.candidate.update({
        where: { id },
        data: { ...input, phoneNormalized },
      })
    } catch (error) {
      if (isPhoneUniqueConstraintError(error)) {
        throw new ConflictException(
          'A candidate with this phone number already exists.',
        )
      }
      throw error
    }
  }

  async delete(id: string) {
    const candidate = await this.getById(id)
    await Promise.all(
      candidate.cvFiles.map((cvFile) => this.storage.delete(cvFile.storageKey)),
    )
    return this.prisma.candidate.delete({ where: { id } })
  }
}
