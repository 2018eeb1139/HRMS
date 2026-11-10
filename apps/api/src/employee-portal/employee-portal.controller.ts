import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import { ok } from '@picode-hr/shared'
import { Request } from 'express'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../rbac/roles.guard'
import { Roles } from '../rbac/roles.decorator'
import { EmployeePortalService } from './employee-portal.service'

type AuthenticatedRequest = Request & { user: { id: string; role: string } }

@Controller('employee-portal')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('EMPLOYEE')
export class EmployeePortalController {
  constructor(private readonly employeePortal: EmployeePortalService) {}

  @Get('dashboard')
  async dashboard(@Req() request: AuthenticatedRequest) {
    return ok(await this.employeePortal.getDashboard(request.user.id))
  }
}
