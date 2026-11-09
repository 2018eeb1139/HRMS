import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import {
  createApplicationSchema,
  moveStageSchema,
  bulkMoveSchema,
  rejectApplicationSchema,
  applicationStatusSchema,
  ok,
} from '@picode-hr/shared'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../rbac/roles.guard'
import { Roles } from '../rbac/roles.decorator'
import { ApplicationsService } from './applications.service'

@Controller('applications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApplicationsController {
  constructor(private svc: ApplicationsService) {}

  @Get()
  async list(
    @Query('roleId') roleId?: string,
    @Query('candidateId') candidateId?: string,
    @Query('stageKey') stageKey?: string,
    @Query('status') status?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return ok(await this.svc.list({
      roleId,
      candidateId,
      stageKey,
      status: status ? applicationStatusSchema.parse(status) : undefined,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    }))
  }

  @Get('pipeline/:roleId')
  async pipelineForRole(@Param('roleId') roleId: string) {
    return ok(await this.svc.pipelineForRole(roleId))
  }

  @Get('pipeline/:roleId/durations')
  async stageDurations(@Param('roleId') roleId: string) {
    return ok(await this.svc.stageDurations(roleId))
  }

  // Declare literal routes before the :id wildcard so they are not swallowed by it
  @Get('funnel/:roleId')
  @Roles('ADMIN', 'HR', 'HIRING_MANAGER', 'PROJECT_MANAGER', 'LEADERSHIP')
  async funnel(@Param('roleId') roleId: string) {
    return ok(await this.svc.funnel(roleId))
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return ok(await this.svc.getById(id))
  }

  @Get(':id/journey')
  @Roles('ADMIN', 'HR', 'HIRING_MANAGER', 'LEADERSHIP', 'INTERVIEWER')
  async journey(@Param('id') id: string) {
    return ok(await this.svc.journey(id))
  }

  @Post()
  @Roles('ADMIN', 'HR', 'HIRING_MANAGER')
  async create(@Body() body: unknown) {
    return ok(await this.svc.create(createApplicationSchema.parse(body)))
  }

  @Put(':id/stage')
  @Roles('ADMIN', 'HR', 'HIRING_MANAGER')
  async moveStage(@Param('id') id: string, @Body() body: unknown) {
    const { toStageKey, byUserId } = moveStageSchema.parse(body)
    return ok(await this.svc.moveStage(id, toStageKey, byUserId))
  }

  @Put('bulk-move')
  @Roles('ADMIN', 'HR')
  async bulkMove(@Body() body: unknown) {
    const { applicationIds, toStageKey, byUserId } = bulkMoveSchema.parse(body)
    return ok(await this.svc.bulkMove(applicationIds, toStageKey, byUserId))
  }

  @Post(':id/reject')
  @Roles('ADMIN', 'HR', 'HIRING_MANAGER')
  async reject(@Param('id') id: string, @Body() body: unknown) {
    const { reason, byUserId } = rejectApplicationSchema.parse(body)
    return ok(await this.svc.reject(id, reason, byUserId))
  }

  @Post(':id/screen')
  @Roles('ADMIN', 'HR')
  async runScreening(@Param('id') id: string) {
    return ok(await this.svc.runScreening(id))
  }
}
