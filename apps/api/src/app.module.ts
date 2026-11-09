import { Module } from '@nestjs/common'
import { HealthController } from './health/health.controller'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { ConfigModule } from './config/config.module'
import { ProjectsModule } from './projects/projects.module'
import { RolesModule } from './roles/roles.module'
import { StorageModule } from './storage/storage.module'
import { QueueModule } from './queue/queue.module'
import { CandidatesModule } from './candidates/candidates.module'
import { AiModule } from './ai/ai.module'
import { ApplicationsModule } from './applications/applications.module'
import { CommunicationsModule } from './communications/communications.module'
import { InterviewsModule } from './interviews/interviews.module'
import { FeedbackModule } from './feedback/feedback.module'
import { OffersModule } from './offers/offers.module'
import { DashboardsModule } from './dashboards/dashboards.module'
import { NotificationsModule } from './notifications/notifications.module'

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, ConfigModule, ProjectsModule, RolesModule, StorageModule, QueueModule, CandidatesModule, AiModule, ApplicationsModule, CommunicationsModule, InterviewsModule, FeedbackModule, OffersModule, DashboardsModule, NotificationsModule],
  controllers: [HealthController],
})
export class AppModule {}
