import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import type { RaisedAlert } from '@picode-hr/shared'
import { PrismaService } from '../prisma/prisma.service'

export interface ListNotificationsFilter {
  unreadOnly?: boolean
  skip?: number
  take?: number
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  listForUser(userId: string, filter: ListNotificationsFilter = {}) {
    const { unreadOnly, skip, take = 50 } = filter
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    })
  }

  async markRead(userId: string, id: string) {
    const notif = await this.prisma.notification.findUnique({ where: { id } })
    if (!notif) throw new NotFoundException(`Notification ${id} not found`)
    if (notif.userId !== userId) throw new ForbiddenException('Not your notification')
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    })
  }

  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    })
  }

  /**
   * Insert notifications for raised alerts, skipping any where an UNREAD
   * notification with the same (userId, type, entityId) already exists.
   */
  async createMany(alerts: RaisedAlert[]): Promise<number> {
    if (alerts.length === 0) return 0

    // Build dedup keys: (userId, type, entityId|'')
    const dedupKeys = alerts.map((a) => ({
      userId: a.userId,
      type: a.type,
      entityId: a.entityId ?? null,
    }))

    // Fetch all existing unread notifications that match any of these combos
    const existing = await this.prisma.notification.findMany({
      where: {
        readAt: null,
        OR: dedupKeys.map((k) => ({
          userId: k.userId,
          type: k.type,
          entityId: k.entityId,
        })),
      },
      select: { userId: true, type: true, entityId: true },
    })

    const existingSet = new Set(
      existing.map((e) => `${e.userId}|${e.type}|${e.entityId ?? ''}`),
    )

    const toInsert = alerts.filter(
      (a) => !existingSet.has(`${a.userId}|${a.type}|${a.entityId ?? ''}`),
    )

    if (toInsert.length === 0) return 0

    await this.prisma.notification.createMany({
      data: toInsert.map((a) => ({
        userId: a.userId,
        type: a.type,
        entityType: a.entityType ?? null,
        entityId: a.entityId ?? null,
        message: a.message,
      })),
    })

    return toInsert.length
  }
}
