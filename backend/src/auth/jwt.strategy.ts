import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../common/decorators/auth.decorators';
import { UsersService } from '../users/users.service';
import { AccessTokenPayload, AuthService } from './auth.service';

/**
 * Bearer-token only (no cookies) so web, Android and iOS authenticate identically.
 * Rejects tokens whose session was revoked (logout / logout-all take effect immediately).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('auth.jwtSecret'),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthUser | null> {
    if (payload.typ !== 'access') return null;
    if (!(await this.auth.isSessionActive(payload.sid, payload.sub))) return null;
    const access = await this.users.getAccess(payload.sub);
    return { id: payload.sub, email: payload.email, sessionId: payload.sid, ...access };
  }
}
