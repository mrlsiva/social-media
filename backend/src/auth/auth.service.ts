import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { IsNull, MoreThan, Not, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EncryptionService } from '../common/crypto/encryption.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { ClientPlatform } from '../common/enums';
import { addSeconds, durationToSeconds } from '../common/utils/duration';
import { RequestMeta } from '../common/utils/request-meta';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { toUserResponse } from '../users/users.mapper';
import {
  AuthResponseDto,
  ChangePasswordDto,
  DeviceInfoDto,
  LoginDto,
  RegisterDto,
  SessionResponseDto,
  TokenPairDto,
} from './dto/auth.dto';
import { UserSession } from './entities/user-session.entity';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  email: string;
  typ: 'access';
}

interface RefreshTokenPayload {
  sub: string;
  sid: string;
  jti: string;
  typ: 'refresh';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessTtl: number;
  private readonly refreshTtl: number;
  /** Hash verified when the email does not exist, so response timing does not reveal registered emails. */
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly users: UsersService,
    private readonly subscriptions: SubscriptionsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    @InjectRepository(UserSession) private readonly sessions: Repository<UserSession>,
  ) {
    this.accessTtl = durationToSeconds(this.config.getOrThrow<string>('auth.jwtExpiresIn'));
    this.refreshTtl = durationToSeconds(this.config.getOrThrow<string>('auth.jwtRefreshExpiresIn'));
    this.dummyHash = argon2.hash(randomUUID(), { type: argon2.argon2id });
  }

  async register(dto: RegisterDto, meta: RequestMeta): Promise<AuthResponseDto> {
    if (await this.users.emailExists(dto.email)) {
      throw AppException.conflict(ErrorCode.AUTH_EMAIL_TAKEN, 'An account with this email already exists');
    }
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const created = await this.users.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      timezone: dto.timezone,
    });
    await this.subscriptions.ensureDefaultSubscription(created.id);
    await this.audit.log({ action: 'auth.register', userId: created.id, entityType: 'user', entityId: created.id, ...meta });
    const user = await this.users.findById(created.id);
    return this.startSession(user, dto, meta);
  }

  async login(dto: LoginDto, meta: RequestMeta): Promise<AuthResponseDto> {
    const user = await this.users.findByEmailWithPassword(dto.email);
    const valid = await argon2.verify(user?.passwordHash ?? (await this.dummyHash), dto.password).catch(() => false);
    if (!user || !valid) {
      await this.audit.log({ action: 'auth.login_failed', metadata: { email: dto.email }, ...meta });
      throw AppException.unauthorized(ErrorCode.AUTH_INVALID, 'Invalid email or password');
    }
    if (!user.isActive) {
      throw AppException.forbidden(ErrorCode.AUTH_INVALID, 'This account is disabled');
    }
    await this.users.touchLogin(user.id);
    await this.audit.log({ action: 'auth.login', userId: user.id, ...meta });
    return this.startSession(await this.users.findById(user.id), dto, meta);
  }

  /**
   * Refresh-token rotation: each refresh token is single use. Presenting an
   * already-rotated token (replay) revokes the whole session.
   */
  async refresh(refreshToken: string, meta: RequestMeta): Promise<AuthResponseDto> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('auth.jwtRefreshSecret'),
      });
    } catch {
      throw AppException.unauthorized(ErrorCode.REFRESH_TOKEN_INVALID, 'Refresh token is invalid or expired');
    }
    if (payload.typ !== 'refresh') {
      throw AppException.unauthorized(ErrorCode.REFRESH_TOKEN_INVALID, 'Refresh token is invalid');
    }

    const session = await this.sessions
      .createQueryBuilder('s')
      .addSelect(['s.refreshTokenHash', 's.previousTokenHash'])
      .where('s.id = :id AND s.user_id = :userId', { id: payload.sid, userId: payload.sub })
      .getOne();

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw AppException.unauthorized(ErrorCode.REFRESH_TOKEN_INVALID, 'Session expired. Please log in again');
    }

    const presentedHash = EncryptionService.sha256(refreshToken);
    if (!EncryptionService.safeEqual(presentedHash, session.refreshTokenHash)) {
      if (session.previousTokenHash && EncryptionService.safeEqual(presentedHash, session.previousTokenHash)) {
        await this.sessions.update({ id: session.id }, { revokedAt: new Date() });
        await this.audit.log({ action: 'auth.refresh_reuse_detected', userId: payload.sub, entityType: 'session', entityId: session.id, ...meta });
        this.logger.warn({ sessionId: session.id }, 'Refresh token reuse detected - session revoked');
      }
      throw AppException.unauthorized(ErrorCode.REFRESH_TOKEN_INVALID, 'Refresh token is invalid');
    }

    const user = await this.users.findById(payload.sub);
    if (!user.isActive) throw AppException.forbidden(ErrorCode.AUTH_INVALID, 'This account is disabled');

    const tokens = await this.issueTokens(user, session.id);
    await this.sessions.update(
      { id: session.id },
      {
        previousTokenHash: session.refreshTokenHash,
        refreshTokenHash: EncryptionService.sha256(tokens.refreshToken),
        lastUsedAt: new Date(),
        expiresAt: addSeconds(new Date(), this.refreshTtl),
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent?.slice(0, 500) ?? null,
      },
    );
    return { user: toUserResponse(user), tokens, sessionId: session.id };
  }

  async logout(userId: string, sessionId: string, meta: RequestMeta): Promise<void> {
    await this.sessions.update({ id: sessionId, userId, revokedAt: IsNull() }, { revokedAt: new Date() });
    await this.audit.log({ action: 'auth.logout', userId, entityType: 'session', entityId: sessionId, ...meta });
  }

  async logoutAll(userId: string, meta: RequestMeta, exceptSessionId?: string): Promise<number> {
    const result = await this.sessions.update(
      { userId, revokedAt: IsNull(), ...(exceptSessionId ? { id: Not(exceptSessionId) } : {}) },
      { revokedAt: new Date() },
    );
    await this.audit.log({ action: 'auth.logout_all', userId, metadata: { exceptCurrent: !!exceptSessionId }, ...meta });
    return result.affected ?? 0;
  }

  async listSessions(userId: string, currentSessionId: string): Promise<SessionResponseDto[]> {
    const rows = await this.sessions.find({
      where: { userId, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      order: { lastUsedAt: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((s) => ({
      id: s.id,
      deviceId: s.deviceId,
      deviceName: s.deviceName,
      platform: s.platform,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      lastUsedAt: s.lastUsedAt,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      current: s.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string, meta: RequestMeta): Promise<void> {
    const result = await this.sessions.update({ id: sessionId, userId, revokedAt: IsNull() }, { revokedAt: new Date() });
    if (!result.affected) throw AppException.notFound(ErrorCode.SESSION_NOT_FOUND, 'Session not found');
    await this.audit.log({ action: 'auth.session_revoked', userId, entityType: 'session', entityId: sessionId, ...meta });
  }

  async changePassword(userId: string, sessionId: string, dto: ChangePasswordDto, meta: RequestMeta): Promise<void> {
    const hash = await this.users.getPasswordHash(userId);
    if (!(await argon2.verify(hash, dto.currentPassword).catch(() => false))) {
      throw new AppException(ErrorCode.AUTH_INVALID, 'Current password is incorrect', HttpStatus.BAD_REQUEST);
    }
    await this.users.updatePassword(userId, await argon2.hash(dto.newPassword, { type: argon2.argon2id }));
    // Sign out every other device after a password change.
    await this.logoutAll(userId, meta, sessionId);
    await this.audit.log({ action: 'auth.password_changed', userId, ...meta });
  }

  async setPushToken(userId: string, sessionId: string, pushToken: string): Promise<void> {
    await this.sessions.update({ id: sessionId, userId }, { pushToken });
  }

  /** Used by the JWT strategy on every request: the session must still be active. */
  async isSessionActive(sessionId: string, userId: string): Promise<boolean> {
    return this.sessions.exists({ where: { id: sessionId, userId, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) } });
  }

  private async startSession(user: User, device: DeviceInfoDto, meta: RequestMeta): Promise<AuthResponseDto> {
    // Re-login from the same device replaces its previous session.
    if (device.deviceId) {
      await this.sessions.update({ userId: user.id, deviceId: device.deviceId, revokedAt: IsNull() }, { revokedAt: new Date() });
    }
    const sessionId = randomUUID();
    const tokens = await this.issueTokens(user, sessionId);
    await this.sessions.insert({
      id: sessionId,
      userId: user.id,
      refreshTokenHash: EncryptionService.sha256(tokens.refreshToken),
      deviceId: device.deviceId ?? null,
      deviceName: device.deviceName ?? null,
      platform: device.platform ?? ClientPlatform.WEB,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
      ipAddress: meta.ipAddress,
      expiresAt: addSeconds(new Date(), this.refreshTtl),
      lastUsedAt: new Date(),
    });
    return { user: toUserResponse(user), tokens, sessionId };
  }

  private async issueTokens(user: User, sessionId: string): Promise<TokenPairDto> {
    const accessPayload: AccessTokenPayload = { sub: user.id, sid: sessionId, email: user.email, typ: 'access' };
    const refreshPayload: RefreshTokenPayload = { sub: user.id, sid: sessionId, jti: randomUUID(), typ: 'refresh' };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.config.getOrThrow<string>('auth.jwtSecret'),
        expiresIn: this.accessTtl,
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.config.getOrThrow<string>('auth.jwtRefreshSecret'),
        expiresIn: this.refreshTtl,
      }),
    ]);
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: this.accessTtl, refreshExpiresIn: this.refreshTtl };
  }
}
