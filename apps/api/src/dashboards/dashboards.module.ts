import { Module } from '@nestjs/common'
import { DashboardsService } from './dashboards.service'
import { DashboardsController } from './dashboards.controller'
import { SavedViewsService } from './saved-views.service'
import { SavedViewsController } from './saved-views.controller'
import { ProjectsModule } from '../projects/projects.module'
import { OffersModule } from '../offers/offers.module'
import { FeedbackModule } from '../feedback/feedback.module'

@Module({
  imports: [ProjectsModule, OffersModule, FeedbackModule],
  providers: [DashboardsService, SavedViewsService],
  controllers: [DashboardsController, SavedViewsController],
})
export class DashboardsModule {}
