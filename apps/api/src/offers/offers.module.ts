import { Module } from '@nestjs/common'
import { OffersService } from './offers.service'
import { OffersController } from './offers.controller'
import { RolesModule } from '../roles/roles.module'
import { OfferLetterPdfService } from './offer-letter-pdf.service'
import { OffboardingService } from './offboarding.service'
import { RelievingLetterPdfService } from './relieving-letter-pdf.service'

@Module({
  imports: [RolesModule],
  providers: [
    OffersService,
    OfferLetterPdfService,
    OffboardingService,
    RelievingLetterPdfService,
  ],
  controllers: [OffersController],
  exports: [OffersService],
})
export class OffersModule {}
