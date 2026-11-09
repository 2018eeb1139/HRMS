import { Controller, Get } from '@nestjs/common'
import { ok } from '@picode-hr/shared'

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return ok({ status: 'ok' as const })
  }
}
