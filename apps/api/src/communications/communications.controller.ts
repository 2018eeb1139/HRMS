import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import {
  createCommunicationSchema,
  updateCommunicationSchema,
  communicationTypeSchema,
  messageDraftInputSchema,
  ok,
} from '@picode-hr/shared'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../rbac/roles.guard'
import { Roles } from '../rbac/roles.decorator'
import { CommunicationsService } from './communications.service'
import { MessageDraftService } from './message-draft.service'

interface AuthedRequest {
  user: { id: string; email: string; role: string }
}

@Controller('communications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'HR', 'HIRING_MANAGER')
export class CommunicationsController {
  constructor(
    private readonly svc: CommunicationsService,
    private readonly draft: MessageDraftService,
  ) {}

  @Get()
  async list(
    @Query('candidateId') candidateId?: string,
    @Query('applicationId') applicationId?: string,
    @Query('type') type?: string,
    @Query('followUpsDue') followUpsDue?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return ok(
      await this.svc.list({
        candidateId,
        applicationId,
        type: type ? communicationTypeSchema.parse(type) : undefined,
        followUpsDue: followUpsDue === 'true',
        skip: skip ? Number(skip) : undefined,
        take: take ? Number(take) : undefined,
      }),
    )
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return ok(await this.svc.getById(id))
  }

  @Post()
  async create(@Body() body: unknown, @Req() req: AuthedRequest) {
    const input = createCommunicationSchema.parse(body)
    return ok(await this.svc.create(input, req.user.id))
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    return ok(await this.svc.update(id, updateCommunicationSchema.parse(body)))
  }

  @Post('draft')
  async messageDraft(@Body() body: unknown) {
    return ok(await this.draft.draft(messageDraftInputSchema.parse(body)))
  }
}
