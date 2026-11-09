import { Module } from '@nestjs/common'
import { InterviewsService } from './interviews.service'
import { InterviewsController } from './interviews.controller'
import { CALENDAR } from './calendar.port'
import { GoogleCalendarAdapter } from './google-calendar.adapter'

@Module({
  providers: [
    InterviewsService,
    { provide: CALENDAR, useClass: GoogleCalendarAdapter },
  ],
  controllers: [InterviewsController],
})
export class InterviewsModule {}
