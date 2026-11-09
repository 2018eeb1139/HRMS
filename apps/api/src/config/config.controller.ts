import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  createDepartmentSchema,
  createSkillSchema,
  createSenioritySchema,
  updateOrgSettingSchema,
  createStageSchema,
  updateStageSchema,
  createTemplateSchema,
  updateTemplateSchema,
  ok,
} from "@picode-hr/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../rbac/roles.guard";
import { Roles } from "../rbac/roles.decorator";
import { ConfigService } from "./config.service";

@Controller("config")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConfigController {
  constructor(private config: ConfigService) {}

  // readable by all authenticated roles (lookup data for dropdowns)
  @Get("departments")
  async listDepartments() {
    return ok(await this.config.listDepartments());
  }

  @Post("departments")
  @Roles("ADMIN")
  async createDepartment(@Body() body: unknown) {
    return ok(
      await this.config.createDepartment(createDepartmentSchema.parse(body)),
    );
  }

  // readable by all authenticated roles (lookup data for dropdowns)
  @Get("skills")
  async listSkills() {
    return ok(await this.config.listSkills());
  }

  @Post("skills")
  @Roles("ADMIN", "HIRING_MANAGER", "HR", "PROJECT_MANAGER", "LEADERSHIP")
  async createSkill(@Body() body: unknown) {
    return ok(await this.config.createSkill(createSkillSchema.parse(body)));
  }

  // readable by all authenticated roles (lookup data for dropdowns)
  @Get("seniority")
  async listSeniority() {
    return ok(await this.config.listSeniority());
  }

  @Post("seniority")
  @Roles("ADMIN")
  async createSeniority(@Body() body: unknown) {
    return ok(
      await this.config.createSeniority(createSenioritySchema.parse(body)),
    );
  }

  @Get("org-setting")
  @Roles("ADMIN")
  async getOrgSetting() {
    return ok(await this.config.getOrgSetting());
  }

  @Put("org-setting")
  @Roles("ADMIN")
  async updateOrgSetting(@Body() body: unknown) {
    return ok(
      await this.config.updateOrgSetting(updateOrgSettingSchema.parse(body)),
    );
  }

  // Pipeline stages — readable by all authenticated roles
  @Get("stages")
  async listStages() {
    return ok(await this.config.listStages());
  }

  @Post("stages")
  @Roles("ADMIN")
  async createStage(@Body() body: unknown) {
    return ok(await this.config.createStage(createStageSchema.parse(body)));
  }

  @Put("stages/:id")
  @Roles("ADMIN")
  async updateStage(@Param("id") id: string, @Body() body: unknown) {
    return ok(await this.config.updateStage(id, updateStageSchema.parse(body)));
  }

  // Feedback Templates — readable by any authenticated user (populates form dropdowns)
  @Get("feedback-templates")
  async listFeedbackTemplates() {
    return ok(await this.config.listFeedbackTemplates());
  }

  @Post("feedback-templates")
  @Roles("ADMIN", "HR")
  async createFeedbackTemplate(@Body() body: unknown) {
    return ok(
      await this.config.createFeedbackTemplate(
        createTemplateSchema.parse(body),
      ),
    );
  }

  @Put("feedback-templates/:id")
  @Roles("ADMIN", "HR")
  async updateFeedbackTemplate(@Param("id") id: string, @Body() body: unknown) {
    return ok(
      await this.config.updateFeedbackTemplate(
        id,
        updateTemplateSchema.parse(body),
      ),
    );
  }
}
