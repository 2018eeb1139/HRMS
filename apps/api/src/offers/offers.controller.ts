import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common'
import type { Request } from 'express'
import {
  createOfferSchema,
  updateOfferSchema,
  setOfferStatusSchema,
  offerStatusSchema,
  createOffboardingSchema,
  updateOffboardingSchema,
  ok,
} from '@picode-hr/shared'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../rbac/roles.guard'
import { Roles } from '../rbac/roles.decorator'
import { OffersService } from './offers.service'
import { OffboardingService } from './offboarding.service'
import type { AuthedUser } from '../auth/auth.service'

@Controller('offers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OffersController {
  constructor(
    private svc: OffersService,
    private offboarding: OffboardingService,
  ) {}

  @Post()
  @Roles('ADMIN', 'HR')
  async create(@Body() body: unknown) {
    return ok(await this.svc.create(createOfferSchema.parse(body)))
  }

  @Get()
  @Roles('ADMIN', 'HR', 'HIRING_MANAGER', 'LEADERSHIP')
  async list(
    @Query('status') status?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return ok(await this.svc.list({
      status: status ? offerStatusSchema.parse(status) : undefined,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    }))
  }

  @Get('tracking/joining')
  @Roles('ADMIN', 'HR', 'HIRING_MANAGER', 'PROJECT_MANAGER', 'LEADERSHIP')
  async joiningTracker() {
    return ok(await this.svc.joiningTracker())
  }

  @Get('tracking/offboarding')
  @Roles('ADMIN', 'HR')
  async offboardingTracker() {
    return ok(await this.offboarding.tracker())
  }

  @Post(':id/offboarding')
  @Roles('ADMIN', 'HR')
  async startOffboarding(@Param('id') id: string, @Body() body: unknown) {
    return ok(await this.offboarding.create(id, createOffboardingSchema.parse(body)))
  }

  @Put(':id/offboarding')
  @Roles('ADMIN', 'HR')
  async updateOffboarding(@Param('id') id: string, @Body() body: unknown) {
    return ok(await this.offboarding.update(id, updateOffboardingSchema.parse(body)))
  }

  @Post(':id/offboarding/settlement')
  @Roles('ADMIN', 'HR')
  async startSettlement(@Param('id') id: string, @Req() req: Request) {
    const pdf = await this.offboarding.startSettlement(id, (req.user as AuthedUser).id)
    const safeId = id.replace(/[^a-z0-9-]/gi, '') || 'employee'
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="${safeId}-Relieving-Experience-Letter.pdf"`,
    })
  }

  @Post(':id/offboarding/settlement/complete')
  @Roles('ADMIN', 'HR')
  async completeSettlement(@Param('id') id: string) {
    return ok(await this.offboarding.completeSettlement(id))
  }

  @Get(':id/offer-letter.pdf')
  @Roles('ADMIN', 'HR', 'HIRING_MANAGER', 'LEADERSHIP')
  async offerLetter(@Param('id') id: string) {
    const pdf = await this.svc.generateOfferLetter(id)
    const safeId = id.replace(/[^a-z0-9-]/gi, '') || 'offer'
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="${safeId}-Offer-Letter.pdf"`,
    })
  }

  @Get(':id')
  @Roles('ADMIN', 'HR', 'HIRING_MANAGER', 'LEADERSHIP')
  async getById(@Param('id') id: string) {
    return ok(await this.svc.getById(id))
  }

  @Put(':id')
  @Roles('ADMIN', 'HR')
  async update(@Param('id') id: string, @Body() body: unknown) {
    return ok(await this.svc.update(id, updateOfferSchema.parse(body)))
  }

  @Put(':id/status')
  @Roles('ADMIN', 'HR')
  async setStatus(@Param('id') id: string, @Body() body: unknown) {
    const { status } = setOfferStatusSchema.parse(body)
    return ok(await this.svc.setStatus(id, status))
  }
}
