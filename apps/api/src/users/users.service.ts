import { Injectable } from '@nestjs/common'
import type { InviteUser } from '@picode-hr/shared'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } })
  }

  invite(input: InviteUser) {
    return this.prisma.user.create({ data: input })
  }
}
