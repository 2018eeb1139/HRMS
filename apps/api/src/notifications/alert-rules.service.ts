import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { UpdateAlertRule } from '@picode-hr/shared'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AlertRulesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.alertRule.findMany({ orderBy: { type: 'asc' } })
  }

  upsert(type: string, input: UpdateAlertRule) {
    return this.prisma.alertRule.upsert({
      where: { type },
      update: {
        ...(input.enabled !== undefined && { enabled: input.enabled }),
        ...(input.config !== undefined && {
          config: input.config as Prisma.InputJsonValue,
        }),
      },
      create: {
        type,
        enabled: input.enabled ?? true,
        config: (input.config ?? {}) as Prisma.InputJsonValue,
      },
    })
  }
}
