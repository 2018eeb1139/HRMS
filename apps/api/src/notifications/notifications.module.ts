import { Module } from '@nestjs/common'
import { NotificationsService } from './notifications.service'
import { NotificationsController } from './notifications.controller'
import { AlertRulesService } from './alert-rules.service'
import { AlertRulesController } from './alert-rules.controller'

@Module({
  providers: [NotificationsService, AlertRulesService],
  controllers: [NotificationsController, AlertRulesController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
