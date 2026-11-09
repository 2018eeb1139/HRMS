import { Module } from '@nestjs/common'
import { CandidatesService } from './candidates.service'
import { CvService } from './cv.service'
import { CandidatesController } from './candidates.controller'

@Module({
  providers: [CandidatesService, CvService],
  controllers: [CandidatesController],
})
export class CandidatesModule {}
