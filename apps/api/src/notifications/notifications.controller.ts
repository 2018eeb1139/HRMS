import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ok } from '@picode-hr/shared'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../rbac/roles.guard'
import { NotificationsService } from './notifications.service'

interface AuthedRequest {
  user: { id: string; email: string; role: string }
}

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  /** GET /notifications?unreadOnly=true — own notifications */
  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return ok(
      await this.svc.listForUser(req.user.id, {
        unreadOnly: unreadOnly === 'true',
        skip: skip ? Number(skip) : undefined,
        take: take ? Number(take) : undefined,
      }),
    )
  }

  /** POST /notifications/:id/read — mark one as read (own only) */
  @Post(':id/read')
  async markRead(@Req() req: AuthedRequest, @Param('id') id: string) {
    return ok(await this.svc.markRead(req.user.id, id))
  }

  /** POST /notifications/read-all — mark all own as read */
  @Post('read-all')
  async markAllRead(@Req() req: AuthedRequest) {
    return ok(await this.svc.markAllRead(req.user.id))
  }
}
