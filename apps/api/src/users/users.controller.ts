import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { inviteUserSchema, ok } from "@picode-hr/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../rbac/roles.guard";
import { Roles } from "../rbac/roles.decorator";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  @Roles("ADMIN", "HR", "HIRING_MANAGER")
  async list() {
    return ok(await this.users.list());
  }

  @Post("invite")
  @Roles("ADMIN", "HR")
  async invite(@Body() body: unknown) {
    return ok(await this.users.invite(inviteUserSchema.parse(body)));
  }
}
