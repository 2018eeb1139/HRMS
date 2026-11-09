import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../rbac/roles.guard'
import { SavedViewsService } from './saved-views.service'
import { ok } from '@picode-hr/shared'

const createSavedViewSchema = z.object({
  name: z.string().min(1),
  scope: z.string().min(1),
  filters: z.record(z.unknown()),
})

interface AuthedRequest {
  user: { id: string; email: string; role: string }
}

@Controller('saved-views')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SavedViewsController {
  constructor(private readonly svc: SavedViewsService) {}

  /** List saved views for the authenticated user, optionally filtered by scope */
  @Get()
  async list(@Req() req: AuthedRequest, @Query('scope') scope?: string) {
    return ok(await this.svc.list(req.user.id, scope))
  }

  /** Create a new saved view owned by the authenticated user */
  @Post()
  async create(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = createSavedViewSchema.parse(body)
    return ok(await this.svc.create(req.user.id, input))
  }

  /** Delete a saved view — only the owner may delete it */
  @Delete(':id')
  async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    return ok(await this.svc.remove(req.user.id, id))
  }
}
