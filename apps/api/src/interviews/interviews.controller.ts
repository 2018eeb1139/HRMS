import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { Request } from 'express'
import {
  interviewStatusSchema,
  ok,
  rescheduleSchema,
  scheduleInterviewSchema,
  setInterviewStatusSchema,
  suggestSlotsSchema,
} from '@picode-hr/shared'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../rbac/roles.guard'
import { Roles } from '../rbac/roles.decorator'
import { InterviewsService } from './interviews.service'

interface AuthUser {
  id: string
  email: string
  role: string
}

@Controller('interviews')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InterviewsController {
  constructor(private svc: InterviewsService) {}

  @Post()
  @Roles('ADMIN', 'HR', 'HIRING_MANAGER')
  async schedule(@Body() body: unknown) {
    return ok(await this.svc.schedule(scheduleInterviewSchema.parse(body)))
  }

  @Post('suggest-slots')
  @Roles('ADMIN', 'HR', 'HIRING_MANAGER')
  async suggestSlots(@Body() body: unknown) {
    return ok(await this.svc.suggestSlots(suggestSlotsSchema.parse(body)))
  }

  @Get()
  async list(
    @Req() req: Request,
    @Query('applicationId') applicationId?: string,
    @Query('interviewerId') interviewerId?: string,
    @Query('status') status?: string,
  ) {
    const user = req.user as AuthUser

    // §11/§15: INTERVIEWER role sees only their own assigned interviews
    const resolvedInterviewerId =
      user.role === 'INTERVIEWER' ? user.id : interviewerId

    return ok(
      await this.svc.list({
        applicationId,
        interviewerId: resolvedInterviewerId,
        status: status ? interviewStatusSchema.parse(status) : undefined,
      }),
    )
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return ok(await this.svc.getById(id))
  }

  @Put(':id/reschedule')
  @Roles('ADMIN', 'HR', 'HIRING_MANAGER')
  async reschedule(@Param('id') id: string, @Body() body: unknown) {
    return ok(await this.svc.reschedule(id, rescheduleSchema.parse(body)))
  }

  @Post(':id/cancel')
  @Roles('ADMIN', 'HR', 'HIRING_MANAGER')
  async cancel(@Param('id') id: string) {
    return ok(await this.svc.cancel(id))
  }

  @Put(':id/status')
  @Roles('ADMIN', 'HR', 'HIRING_MANAGER', 'INTERVIEWER')
  async setStatus(@Param('id') id: string, @Body() body: unknown) {
    const { status } = setInterviewStatusSchema.parse(body)
    return ok(await this.svc.setStatus(id, status))
  }
}
