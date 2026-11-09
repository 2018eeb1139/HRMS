import { Module } from "@nestjs/common";
import { RolesService } from "./roles.service";
import { JdPdfService } from "./jd-pdf.service";
import { RolesController } from "./roles.controller";

@Module({
  providers: [RolesService, JdPdfService],
  controllers: [RolesController],
  exports: [RolesService],
})
export class RolesModule {}
