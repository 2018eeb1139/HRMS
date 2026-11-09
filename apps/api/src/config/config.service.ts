import { Injectable } from '@nestjs/common'
import type { CreateDepartment, CreateSkill, CreateSeniority, UpdateOrgSetting, CreateStage, UpdateStage, CreateTemplate, UpdateTemplate } from '@picode-hr/shared'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class ConfigService {
  constructor(private prisma: PrismaService) {}

  listDepartments() { return this.prisma.department.findMany({ orderBy: { name: 'asc' } }) }
  createDepartment(input: CreateDepartment) { return this.prisma.department.create({ data: input }) }

  listSkills() { return this.prisma.skill.findMany({ orderBy: { name: 'asc' } }) }
  createSkill(input: CreateSkill) { return this.prisma.skill.create({ data: input }) }

  listSeniority() { return this.prisma.seniorityLevel.findMany({ orderBy: { rank: 'asc' } }) }
  createSeniority(input: CreateSeniority) { return this.prisma.seniorityLevel.create({ data: input }) }

  getOrgSetting() {
    return this.prisma.orgSetting.upsert({
      where: { id: 'singleton' }, update: {}, create: { id: 'singleton' },
    })
  }

  updateOrgSetting(input: UpdateOrgSetting) {
    return this.prisma.orgSetting.upsert({
      where: { id: 'singleton' },
      update: { headcountCountsOn: input.headcountCountsOn },
      create: { id: 'singleton', headcountCountsOn: input.headcountCountsOn },
    })
  }

  listStages() {
    return this.prisma.pipelineStage.findMany({ orderBy: { order: 'asc' } })
  }

  createStage(input: CreateStage) {
    return this.prisma.pipelineStage.create({ data: input })
  }

  updateStage(id: string, input: UpdateStage) {
    return this.prisma.pipelineStage.update({ where: { id }, data: input })
  }

  listFeedbackTemplates() {
    return this.prisma.feedbackTemplate.findMany({ orderBy: { createdAt: 'asc' } })
  }

  createFeedbackTemplate(input: CreateTemplate) {
    const { fields, ...rest } = input
    return this.prisma.feedbackTemplate.create({ data: { ...rest, fields } })
  }

  updateFeedbackTemplate(id: string, input: UpdateTemplate) {
    const { fields, ...rest } = input
    return this.prisma.feedbackTemplate.update({
      where: { id },
      data: { ...rest, ...(fields !== undefined ? { fields } : {}) },
    })
  }
}
