import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { CreateRole, UpdateRole, CloseRole, RoleStatus, Priority } from '@picode-hr/shared'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  list(filters: {
    skip?: number
    take?: number
    projectId?: string
    status?: RoleStatus
    priority?: Priority
    hiringManagerId?: string
    hrOwnerId?: string
  }) {
    const { skip, take, projectId, status, priority, hiringManagerId, hrOwnerId } = filters
    return this.prisma.roleReq.findMany({
      skip,
      take: take ?? 50,
      orderBy: { createdAt: 'desc' },
      where: {
        ...(projectId && { projectId }),
        ...(status && { status }),
        ...(priority && { priority }),
        ...(hiringManagerId && { hiringManagerId }),
        ...(hrOwnerId && { hrOwnerId }),
      },
    })
  }

  async getById(id: string) {
    const role = await this.prisma.roleReq.findUnique({
      where: { id },
      include: { project: true, department: true, seniority: true },
    })
    if (!role) throw new NotFoundException(`Role ${id} not found`)
    return { ...role, remainingCount: role.requiredCount - role.filledCount }
  }

  create(input: CreateRole) {
    return this.prisma.roleReq.create({ data: input })
  }

  async update(id: string, input: UpdateRole) {
    await this.getById(id)
    return this.prisma.roleReq.update({ where: { id }, data: input })
  }

  async delete(id: string) {
    await this.getById(id)
    return this.prisma.roleReq.delete({ where: { id } })
  }

  async setStatus(id: string, status: RoleStatus) {
    await this.getById(id)
    return this.prisma.roleReq.update({ where: { id }, data: { status } })
  }

  async close(id: string, { reason, notes }: CloseRole) {
    const role = await this.prisma.roleReq.findUnique({ where: { id } })
    if (!role) throw new NotFoundException(`Role ${id} not found`)

    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('A closure reason is required to close a role')
    }

    return this.prisma.roleReq.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closureReason: reason,
        closureNotes: notes ?? null,
        closedAt: new Date(),
      },
    })
  }

  async incrementFilled(id: string) {
    const role = await this.prisma.roleReq.findUnique({ where: { id } })
    if (!role) throw new NotFoundException(`Role ${id} not found`)

    const newFilled = Math.min(role.filledCount + 1, role.requiredCount)
    const newStatus = newFilled >= role.requiredCount ? 'FILLED' : role.status

    return this.prisma.roleReq.update({
      where: { id },
      data: { filledCount: newFilled, status: newStatus },
    })
  }

  async decrementFilled(id: string) {
    const role = await this.prisma.roleReq.findUnique({ where: { id } })
    if (!role) throw new NotFoundException(`Role ${id} not found`)

    const newFilled = Math.max(role.filledCount - 1, 0)

    return this.prisma.roleReq.update({
      where: { id },
      data: { filledCount: newFilled },
    })
  }
}
