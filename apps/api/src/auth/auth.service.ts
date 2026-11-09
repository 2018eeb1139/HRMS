import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'

export type GoogleProfile = { email: string; googleId: string; name: string }
export type AuthedUser = { id: string; email: string; role: string }
export type DevUserDto = { email: string; name: string; role: string }

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  // DEV_LOGIN_ENABLED must NEVER be 'true' in production — it bypasses Google SSO.
  private get devLoginEnabled(): boolean {
    return process.env.DEV_LOGIN_ENABLED === 'true'
  }

  async validateGoogleUser(profile: GoogleProfile) {
    const existing = await this.prisma.user.findUnique({ where: { email: profile.email } })
    if (!existing || !existing.isActive) throw new UnauthorizedException('Not authorized')
    if (existing.googleId === profile.googleId) return existing
    return this.prisma.user.update({
      where: { id: existing.id },
      data: { googleId: profile.googleId },
    })
  }

  issueToken(user: AuthedUser): string {
    return this.jwt.sign({ sub: user.id, email: user.email, role: user.role })
  }

  async devLogin(email: string): Promise<string> {
    if (!this.devLoginEnabled) throw new ForbiddenException('Dev login disabled')
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user || !user.isActive) throw new UnauthorizedException('Unknown demo user')
    return this.issueToken(user)
  }

  async listDevUsers(): Promise<DevUserDto[]> {
    if (!this.devLoginEnabled) return []
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, email: true, name: true, role: true },
      orderBy: { role: 'asc' },
    })
    return users.map((u) => ({ email: u.email, name: u.name ?? u.email, role: u.role }))
  }
}
