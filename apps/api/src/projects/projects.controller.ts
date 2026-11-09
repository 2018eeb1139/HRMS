import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { createProjectSchema, updateProjectSchema, ok } from '@picode-hr/shared'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../rbac/roles.guard'
import { Roles } from '../rbac/roles.decorator'
import { ProjectsService } from './projects.service'

@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  constructor(private projects: ProjectsService) {}

  @Get()
  async list(@Query('skip') skip?: string, @Query('take') take?: string) {
    return ok(await this.projects.list({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    }))
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return ok(await this.projects.getById(id))
  }

  @Get(':id/staffing')
  async staffingSummary(@Param('id') id: string) {
    return ok(await this.projects.staffingSummary(id))
  }

  @Post()
  @Roles('ADMIN', 'HR', 'PROJECT_MANAGER')
  async create(@Body() body: unknown) {
    return ok(await this.projects.create(createProjectSchema.parse(body)))
  }

  @Put(':id')
  @Roles('ADMIN', 'HR', 'PROJECT_MANAGER')
  async update(@Param('id') id: string, @Body() body: unknown) {
    return ok(await this.projects.update(id, updateProjectSchema.parse(body)))
  }
}
