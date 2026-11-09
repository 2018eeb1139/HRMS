import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { Request } from 'express'
import { submitFeedbackSchema, ok } from '@picode-hr/shared'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../rbac/roles.guard'
import { Roles } from '../rbac/roles.decorator'
import { FeedbackService } from './feedback.service'

interface AuthUser {
  id: string
  email: string
  role: string
}

@Controller('feedback')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FeedbackController {
  constructor(private readonly svc: FeedbackService) {}

  /**
   * Submit feedback for an interview.
   * interviewerId is taken from the authenticated JWT user, not the request body.
   */
  @Post()
  @Roles('INTERVIEWER', 'HIRING_MANAGER', 'HR', 'ADMIN')
  async submit(@Body() body: unknown, @Req() req: Request) {
    const user = req.user as AuthUser
    const input = submitFeedbackSchema.parse(body)
    return ok(await this.svc.submit(input, user.id))
  }

  /** List all feedback for a specific interview — any authenticated role. */
  @Get('interview/:interviewId')
  async listForInterview(@Param('interviewId') interviewId: string) {
    return ok(await this.svc.listForInterview(interviewId))
  }

  /** List all feedback across all interviews for an application. */
  @Get('application/:applicationId')
  @Roles('ADMIN', 'HR', 'HIRING_MANAGER')
  async listForApplication(@Param('applicationId') applicationId: string) {
    return ok(await this.svc.listForApplication(applicationId))
  }

  /**
   * Tracking report: submitted / pending / delayed / conflicting.
   * Optional ?roleId= scopes the report to one role's applications.
   */
  @Get('tracking')
  @Roles('ADMIN', 'HR', 'HIRING_MANAGER', 'LEADERSHIP')
  async tracking(@Query('roleId') roleId?: string) {
    return ok(await this.svc.tracking(roleId))
  }

  /** AI cross-interviewer summary for all feedback on an application. */
  @Get('application/:applicationId/summary')
  @Roles('ADMIN', 'HR', 'HIRING_MANAGER')
  async aiSummary(@Param('applicationId') applicationId: string) {
    return ok(await this.svc.aiSummary(applicationId))
  }
}
