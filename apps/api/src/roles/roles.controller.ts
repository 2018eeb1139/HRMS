import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  BadRequestException,
  StreamableFile,
} from "@nestjs/common";
import { z } from "zod";
import {
  createRoleSchema,
  updateRoleSchema,
  closeRoleSchema,
  roleStatusSchema,
  prioritySchema,
  ok,
} from "@picode-hr/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../rbac/roles.guard";
import { Roles } from "../rbac/roles.decorator";
import { RolesService } from "./roles.service";
import { JdPdfService } from "./jd-pdf.service";

@Controller("roles")
@UseGuards(JwtAuthGuard, RolesGuard)
export class RolesController {
  constructor(
    private rolesService: RolesService,
    private jdPdfService: JdPdfService,
  ) {}

  @Get()
  async list(
    @Query("skip") skip?: string,
    @Query("take") take?: string,
    @Query("projectId") projectId?: string,
    @Query("status") status?: string,
    @Query("priority") priority?: string,
    @Query("hiringManagerId") hiringManagerId?: string,
    @Query("hrOwnerId") hrOwnerId?: string,
  ) {
    return ok(
      await this.rolesService.list({
        skip: skip ? Number(skip) : undefined,
        take: take ? Number(take) : undefined,
        projectId,
        status: status ? roleStatusSchema.parse(status) : undefined,
        priority: priority ? prioritySchema.parse(priority) : undefined,
        hiringManagerId,
        hrOwnerId,
      }),
    );
  }

  @Get(":id")
  async getById(@Param("id") id: string) {
    return ok(await this.rolesService.getById(id));
  }

  @Get(":id/jd.pdf")
  async jdPdf(@Param("id") id: string) {
    const role = await this.rolesService.getById(id); // 404 if it doesn't exist
    if (!role.jobDescription?.trim()) {
      throw new BadRequestException("This role has no job description yet");
    }

    const pdf = await this.jdPdfService.render({
      title: role.title,
      experience:
        role.requiredYearsExperience != null
          ? `${role.requiredYearsExperience}+ Years`
          : undefined,
      location: role.location,
      employmentType: role.employmentType,
      responsibilities: role.responsibilities,
      requiredSkills: role.requiredSkills,
      education: role.education,
      certifications: role.certifications,
      languages: role.languages,
      jobDescription: role.jobDescription,
    });

    // Safe filename: "Senior Backend Engineer" → "Senior-Backend-Engineer-JD.pdf"
    const safeTitle =
      role.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "role";
    return new StreamableFile(pdf, {
      type: "application/pdf",
      disposition: `attachment; filename="${safeTitle}-JD.pdf"`,
    });
  }

  @Post()
  @Roles("ADMIN", "HR", "HIRING_MANAGER")
  async create(@Body() body: unknown) {
    return ok(await this.rolesService.create(createRoleSchema.parse(body)));
  }

  @Put(":id")
  @Roles("ADMIN", "HR", "HIRING_MANAGER")
  async update(@Param("id") id: string, @Body() body: unknown) {
    return ok(await this.rolesService.update(id, updateRoleSchema.parse(body)));
  }

  @Delete(":id")
  @Roles("ADMIN", "HR", "HIRING_MANAGER")
  async delete(@Param("id") id: string) {
    return ok(await this.rolesService.delete(id));
  }

  @Put(":id/status")
  @Roles("ADMIN", "HR", "HIRING_MANAGER")
  async setStatus(@Param("id") id: string, @Body() body: unknown) {
    const { status } = z.object({ status: roleStatusSchema }).parse(body);
    return ok(await this.rolesService.setStatus(id, status));
  }

  @Post(":id/close")
  @Roles("ADMIN", "HR", "HIRING_MANAGER")
  async close(@Param("id") id: string, @Body() body: unknown) {
    return ok(await this.rolesService.close(id, closeRoleSchema.parse(body)));
  }
}
