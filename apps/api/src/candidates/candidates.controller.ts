import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Multer } from "multer";
import {
  createCandidateSchema,
  updateCandidateSchema,
  candidateSourceSchema,
  ok,
} from "@picode-hr/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../rbac/roles.guard";
import { Roles } from "../rbac/roles.decorator";
import { CandidatesService } from "./candidates.service";
import { CvService } from "./cv.service";

@Controller("candidates")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CandidatesController {
  constructor(
    private candidatesService: CandidatesService,
    private cvService: CvService,
  ) {}

  @Get()
  async list(
    @Query("skip") skip?: string,
    @Query("take") take?: string,
    @Query("source") source?: string,
    @Query("tag") tag?: string,
    @Query("q") q?: string,
  ) {
    return ok(
      await this.candidatesService.list({
        skip: skip ? Number(skip) : undefined,
        take: take ? Number(take) : undefined,
        source: source ? candidateSourceSchema.parse(source) : undefined,
        tag,
        q,
      }),
    );
  }

  @Get(":id")
  async getById(@Param("id") id: string) {
    return ok(await this.candidatesService.getById(id));
  }

  @Post()
  @Roles("ADMIN", "HR")
  async create(@Body() body: unknown) {
    return ok(
      await this.candidatesService.create(createCandidateSchema.parse(body)),
    );
  }

  @Put(":id")
  @Roles("ADMIN", "HR")
  async update(@Param("id") id: string, @Body() body: unknown) {
    return ok(
      await this.candidatesService.update(
        id,
        updateCandidateSchema.parse(body),
      ),
    );
  }

  @Delete(":id")
  @Roles("ADMIN", "HR")
  async delete(@Param("id") id: string) {
    return ok(await this.candidatesService.delete(id));
  }

  @Post(":id/cv")
  @Roles("ADMIN", "HR")
  @UseInterceptors(FileInterceptor("file"))
  async uploadCv(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return ok(
      await this.cvService.uploadCv(id, {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      }),
    );
  }

  @Post("parse-cv")
  @Roles("ADMIN", "HR")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async parseCv(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("Resume file is required.");
    }
    return ok(
      await this.cvService.parseResume({
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      }),
    );
  }
}
