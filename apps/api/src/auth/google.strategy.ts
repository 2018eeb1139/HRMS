import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20'
import { AuthService } from './auth.service'

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private auth: AuthService) {
    super(GoogleStrategy.opts())
  }

  private static opts() {
    const clientID = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const callbackURL = process.env.GOOGLE_CALLBACK_URL
    if (!clientID || !clientSecret || !callbackURL) {
      throw new Error('GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL env vars are required')
    }
    return { clientID, clientSecret, callbackURL, scope: ['email', 'profile'] }
  }

  async validate(_at: string, _rt: string, profile: Profile, done: VerifyCallback) {
    try {
      const user = await this.auth.validateGoogleUser({
        email: profile.emails?.[0]?.value ?? '',
        googleId: profile.id,
        name: profile.displayName ?? 'Unknown',
      })
      done(null, { id: user.id, email: user.email, role: user.role })
    } catch (e) {
      done(e as Error, undefined)
    }
  }
}
