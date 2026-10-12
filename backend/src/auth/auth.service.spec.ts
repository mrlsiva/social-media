import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { ErrorCode } from '../common/errors/error-codes';
import { EncryptionService } from '../common/crypto/encryption.service';
import { AuthService } from './auth.service';

const config = new ConfigService({
  auth: {
    jwtSecret: 'a'.repeat(40),
    jwtRefreshSecret: 'b'.repeat(40),
    jwtExpiresIn: '15m',
    jwtRefreshExpiresIn: '30d',
  },
});

function setup() {
  const sessions: Record<string, any>[] = [];
  const user = { id: 'u1', email: 'owner@sling.com', firstName: 'Priya', lastName: null, isActive: true, roles: [], timezone: 'UTC', createdAt: new Date() };
  const users = {
    emailExists: jest.fn().mockResolvedValue(false),
    create: jest.fn().mockResolvedValue(user),
    findById: jest.fn().mockResolvedValue(user),
    findByEmailWithPassword: jest.fn(),
    touchLogin: jest.fn(),
  };
  const match = (row: Record<string, any>, where: Record<string, any>) => Object.entries(where).every(([k, v]) => typeof v === 'object' && v !== null ? true : row[k] === v);
  const sessionRepo = {
    insert: jest.fn(async (row: Record<string, any>) => sessions.push({ ...row, revokedAt: null })),
    update: jest.fn(async (where: Record<string, any>, patch: Record<string, any>) => {
      const hits = sessions.filter((s) => match(s, where));
      hits.forEach((s) => Object.assign(s, patch));
      return { affected: hits.length };
    }),
    createQueryBuilder: () => {
      let params: Record<string, any> = {};
      const qb = {
        addSelect: () => qb,
        where: (_: string, p: Record<string, any>) => ((params = p), qb),
        getOne: async () => sessions.find((s) => s.id === params.id && s.userId === params.userId) ?? null,
      };
      return qb;
    },
    exists: jest.fn(),
  };
  const service = new AuthService(
    users as never,
    { ensureDefaultSubscription: jest.fn() } as never,
    new JwtService({}),
    config,
    { log: jest.fn() } as never,
    sessionRepo as never,
  );
  return { service, users, sessions, user };
}

const meta = { ipAddress: '127.0.0.1', userAgent: 'jest' };

describe('AuthService', () => {
  it('registers, hashes the password with argon2 and starts a device session', async () => {
    const { service, users, sessions } = setup();
    const res = await service.register({ firstName: 'Priya', email: 'owner@sling.com', password: 'Str0ngPassw0rd', deviceId: 'ios-1', platform: 'ios' as never }, meta);

    const passwordHash = users.create.mock.calls[0][0].passwordHash as string;
    expect(passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(res.tokens.tokenType).toBe('Bearer');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ deviceId: 'ios-1', platform: 'ios' });
    // Only a hash of the refresh token is stored.
    expect(sessions[0].refreshTokenHash).toBe(EncryptionService.sha256(res.tokens.refreshToken));
  });

  it('rejects duplicate emails', async () => {
    const { service, users } = setup();
    users.emailExists.mockResolvedValue(true);
    await expect(service.register({ firstName: 'A', email: 'a@b.com', password: 'Str0ngPassw0rd' }, meta)).rejects.toMatchObject({ code: ErrorCode.AUTH_EMAIL_TAKEN });
  });

  it('rejects a wrong password with AUTH_INVALID', async () => {
    const { service, users, user } = setup();
    users.findByEmailWithPassword.mockResolvedValue({ ...user, passwordHash: await argon2.hash('Correct1Pass') });
    await expect(service.login({ email: user.email, password: 'Wrong1Pass' }, meta)).rejects.toMatchObject({ code: ErrorCode.AUTH_INVALID });
  });

  it('rotates refresh tokens and revokes the session when an old token is replayed', async () => {
    const { service, sessions } = setup();
    const first = await service.register({ firstName: 'P', email: 'p@s.com', password: 'Str0ngPassw0rd' }, meta);

    const second = await service.refresh(first.tokens.refreshToken, meta);
    expect(second.tokens.refreshToken).not.toBe(first.tokens.refreshToken);

    await expect(service.refresh(first.tokens.refreshToken, meta)).rejects.toMatchObject({ code: ErrorCode.REFRESH_TOKEN_INVALID });
    expect(sessions[0].revokedAt).toBeInstanceOf(Date);
    await expect(service.refresh(second.tokens.refreshToken, meta)).rejects.toMatchObject({ code: ErrorCode.REFRESH_TOKEN_INVALID });
  });

  it('does not accept an access token as a refresh token', async () => {
    const { service } = setup();
    const res = await service.register({ firstName: 'P', email: 'p@s.com', password: 'Str0ngPassw0rd' }, meta);
    await expect(service.refresh(res.tokens.accessToken, meta)).rejects.toMatchObject({ code: ErrorCode.REFRESH_TOKEN_INVALID });
  });
});
