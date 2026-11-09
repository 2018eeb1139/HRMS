import { Injectable, NotFoundException } from '@nestjs/common'
import type { CreateProject, UpdateProject } from '@picode-hr/shared'
import { PrismaService } from '../prisma/prisma.service'

const EXCLUDED_ROLE_STATUSES = ['CANCELLED', 'CLOSED'] as const
const OPEN_ROLE_STATUSES = ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'DRAFT', 'PENDING_APPROVAL'] as const

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  list({ skip, take }: { skip?: number; take?: number }) {
    return this.prisma.project.findMany({
      skip,
      take: take ?? 50,
      orderBy: { createdAt: 'desc' },
    })
  }

  async getById(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id } })
    if (!project) throw new NotFoundException(`Project ${id} not found`)
    return project
  }

  create(input: CreateProject) {
    return this.prisma.project.create({ data: input })
  }

  async update(id: string, input: UpdateProject) {
    await this.getById(id)
    return this.prisma.project.update({ where: { id }, data: input })
  }

  async staffingSummary(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { roles: true },
    })
    if (!project) throw new NotFoundException(`Project ${projectId} not found`)

    const activeRoles = project.roles.filter(
      (r) => !EXCLUDED_ROLE_STATUSES.includes(r.status as never),
    )

    const requiredHeadcount = activeRoles.reduce((sum, r) => sum + r.requiredCount, 0)
    const filledHeadcount = activeRoles.reduce((sum, r) => sum + r.filledCount, 0)
    const gap = requiredHeadcount - filledHeadcount
    const openRoles = project.roles.filter((r) =>
      OPEN_ROLE_STATUSES.includes(r.status as never),
    ).length

    const riskLevel = gap <= 0 ? 'LOW' : gap <= 2 ? 'MEDIUM' : 'HIGH'

    return { requiredHeadcount, filledHeadcount, gap, openRoles, riskLevel }
  }
}
