import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { AuthService, AuthedUser } from './auth.service'
import { JwtAuthGuard } from './jwt-auth.guard'
import { ok } from '@picode-hr/shared'

const DevLoginSchema = z.object({ email: z.string().email() })

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  login() {
    /* passport redirects to Google */
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  callback(@Req() req: Request, @Res() res: Response) {
    const token = this.auth.issueToken(req.user as AuthedUser)
    const web = process.env.WEB_ORIGIN ?? 'http://localhost:5173'
    res.redirect(`${web}/login#token=${token}`)
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request) {
    return ok(req.user)
  }

  // Unguarded — returns [] when DEV_LOGIN_ENABLED is not 'true' (safe in production).
  @Get('dev-users')
  async devUsers() {
    return ok(await this.auth.listDevUsers())
  }

  // Unguarded — throws ForbiddenException when DEV_LOGIN_ENABLED is not 'true'.
  // This endpoint is an auth bypass and MUST remain disabled (flag off) in production.
  @Post('dev-login')
  async devLogin(@Body() body: unknown) {
    const { email } = DevLoginSchema.parse(body)
    return ok({ token: await this.auth.devLogin(email) })
  }
}
