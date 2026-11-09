import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface CreateSavedViewInput {
  name: string
  scope: string
  filters: Record<string, unknown>
}

@Injectable()
export class SavedViewsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, scope?: string) {
    return this.prisma.savedView.findMany({
      where: { userId, ...(scope ? { scope } : {}) },
      orderBy: { createdAt: 'desc' },
    })
  }

  create(userId: string, input: CreateSavedViewInput) {
    return this.prisma.savedView.create({
      data: { userId, name: input.name, scope: input.scope, filters: input.filters as object },
    })
  }

  async remove(userId: string, id: string) {
    const view = await this.prisma.savedView.findUnique({ where: { id } })
    if (!view) throw new NotFoundException(`SavedView ${id} not found`)
    if (view.userId !== userId) throw new ForbiddenException('Cannot delete another user\'s saved view')
    return this.prisma.savedView.delete({ where: { id } })
  }
}
