import { Module } from '@nestjs/common'
import { CommunicationsService } from './communications.service'
import { CommunicationsController } from './communications.controller'
import { MessageDraftService } from './message-draft.service'

@Module({
  providers: [CommunicationsService, MessageDraftService],
  controllers: [CommunicationsController],
})
export class CommunicationsModule {}
