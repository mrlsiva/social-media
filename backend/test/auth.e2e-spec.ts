import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

/**
 * Boots the full application against the database in .env (run migrations first).
 * Redis is optional: the API degrades gracefully when it is unavailable.
 */
describe('Auth & brands (e2e)', () => {
  let app: NestExpressApplication;
  const email = `e2e+${Date.now()}@example.com`;
  let accessToken = '';
  let refreshToken = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    // BullMQ workers wait for Redis while closing; do not let a missing Redis hang the test run.
    await Promise.race([app?.close(), new Promise((resolve) => setTimeout(resolve, 5000))]);
  });

  it('POST /api/v1/auth/register returns the standard envelope with tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ firstName: 'E2E', email, password: 'Str0ngPassw0rd', deviceId: 'e2e-device', platform: 'android' })
      .expect(201);
    expect(res.body).toMatchObject({ success: true, message: 'Account created', data: { user: { email } }, meta: {} });
    accessToken = res.body.data.tokens.accessToken;
    refreshToken = res.body.data.tokens.refreshToken;
  });

  it('rejects invalid payloads with VALIDATION_FAILED', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email: 'nope' }).expect(400);
    expect(res.body).toMatchObject({ success: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('protects routes with bearer tokens (no cookies)', async () => {
    await request(app.getHttpServer()).get('/api/v1/brands').expect(401);
    const res = await request(app.getHttpServer()).get('/api/v1/brands?page=1&limit=20').set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
  });

  it('creates a brand and isolates it from other users', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'E2E Brand' })
      .expect(201);

    const other = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ firstName: 'Other', email: `other+${Date.now()}@example.com`, password: 'Str0ngPassw0rd' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/brands/${created.body.data.id}`)
      .set('Authorization', `Bearer ${other.body.data.tokens.accessToken}`)
      .expect(404);
    expect(res.body.error.code).toBe('BRAND_NOT_FOUND');
  });

  it('rotates refresh tokens and logs out the device', async () => {
    const refreshed = await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken }).expect(200);
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);

    const token = refreshed.body.data.tokens.accessToken;
    // Replay revoked the whole session, so the new access token is rejected too.
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  });
});
