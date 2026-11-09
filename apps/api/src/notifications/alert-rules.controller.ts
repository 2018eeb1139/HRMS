import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common'
import { ok, updateAlertRuleSchema } from '@picode-hr/shared'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../rbac/roles.guard'
import { Roles } from '../rbac/roles.decorator'
import { AlertRulesService } from './alert-rules.service'

@Controller('config/alert-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AlertRulesController {
  constructor(private readonly svc: AlertRulesService) {}

  /** GET /config/alert-rules — any authenticated user */
  @Get()
  async list() {
    return ok(await this.svc.list())
  }

  /** PUT /config/alert-rules/:type — ADMIN only */
  @Put(':type')
  @Roles('ADMIN')
  async upsert(@Param('type') type: string, @Body() body: unknown) {
    const input = updateAlertRuleSchema.parse(body)
    return ok(await this.svc.upsert(type, input))
  }
}
