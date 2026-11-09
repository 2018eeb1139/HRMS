import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../rbac/roles.guard'
import { Roles } from '../rbac/roles.decorator'
import { DashboardsService } from './dashboards.service'
import { ok } from '@picode-hr/shared'

@Controller('dashboards')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardsController {
  constructor(private readonly svc: DashboardsService) {}

  /** Executive dashboard — headcount overview, high-priority/risk roles, offers, joiners */
  @Get('executive')
  @Roles('ADMIN', 'HR', 'LEADERSHIP', 'HIRING_MANAGER')
  async executive() {
    return ok(await this.svc.executive())
  }

  /** HR operations dashboard — pipeline status, pending actions, follow-ups */
  @Get('hr-ops')
  @Roles('ADMIN', 'HR')
  async hrOps() {
    return ok(await this.svc.hrOps())
  }

  /** Per-project staffing summary */
  @Get('project-staffing')
  @Roles('ADMIN', 'HR', 'PROJECT_MANAGER', 'LEADERSHIP')
  async projectStaffing() {
    return ok(await this.svc.projectStaffing())
  }

  /** Joining tracker — upcoming joiners with offer/doc/risk status */
  @Get('joining')
  @Roles('ADMIN', 'HR', 'HIRING_MANAGER', 'PROJECT_MANAGER', 'LEADERSHIP')
  async joiningTracker() {
    return ok(await this.svc.joiningTracker())
  }

  /** Gap analysis — six gap types computed on demand */
  @Get('gaps')
  @Roles('ADMIN', 'HR', 'LEADERSHIP', 'PROJECT_MANAGER')
  async gapAnalysis() {
    return ok(await this.svc.gapAnalysis())
  }

  /** Role-level drill-down — counts, risk, days open */
  @Get('role/:roleId')
  async roleLevel(@Param('roleId') roleId: string) {
    return ok(await this.svc.roleLevel(roleId))
  }
}
