import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { screeningInputSchema, ok } from '@picode-hr/shared'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../rbac/roles.guard'
import { Roles } from '../rbac/roles.decorator'
import { SCREENING } from './screening/screening.service'
import type { ScreeningService } from './screening/screening.service'
import { Inject } from '@nestjs/common'

@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(@Inject(SCREENING) private readonly screening: ScreeningService) {}

  /**
   * Debug endpoint — available to ADMIN and HR only.
   * Validates body against screeningInputSchema, runs scoring, returns result.
   */
  @Post('screen')
  @Roles('ADMIN', 'HR')
  async screen(@Body() body: unknown) {
    const input = screeningInputSchema.parse(body)
    return ok(await this.screening.score(input))
  }
}
