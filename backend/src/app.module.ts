import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { AiModule } from './ai/ai.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BrandsModule } from './brands/brands.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { CommonModule } from './common/common.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import configuration, { AppConfig, DatabaseConfig, RedisConfig, ThrottleConfig } from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { buildTypeOrmOptions } from './database/typeorm.options';
import { HealthModule } from './health/health.module';
import { MediaModule } from './media/media.module';
import { StorageModule } from './media/storage/storage.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PostsModule } from './posts/posts.module';
import { PublishingModule } from './publishing/publishing.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SocialAccountsModule } from './social-accounts/social-accounts.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { UsersModule } from './users/users.module';

/** Never log credentials, tokens or API keys. */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.query.code',
  'req.query.state',
  'req.query.access_token',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.accessToken',
  '*.refreshToken',
  '*.access_token',
  '*.refresh_token',
  '*.client_secret',
  '*.apiKey',
  '*.pushToken',
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validationSchema: envValidationSchema, cache: true }),

    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const app = config.getOrThrow<AppConfig>('app');
        return {
          pinoHttp: {
            level: app.logLevel,
            redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
            autoLogging: { ignore: (req) => req.url?.startsWith('/uploads') === true || req.url === '/api/v1/health' },
            customProps: () => ({ service: 'api' }),
            serializers: {
              req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url?.split('?')[0] }),
            },
            transport: app.env === 'development' ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' } } : undefined,
          },
        };
      },
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildTypeOrmOptions(config.getOrThrow<DatabaseConfig>('database')),
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redis = config.getOrThrow<RedisConfig>('redis');
        return {
          connection: {
            host: redis.host,
            port: redis.port,
            password: redis.password,
            db: redis.db,
            // Fail fast when Redis is down instead of hanging HTTP requests.
            enableOfflineQueue: false,
            maxRetriesPerRequest: null,
            // Back off reconnect attempts (and their log lines) up to 30s while Redis is down.
            retryStrategy: (times: number) => Math.min(times * 2000, 30_000),
          },
          defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 },
        };
      },
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const t = config.getOrThrow<ThrottleConfig>('throttle');
        return { throttlers: [{ name: 'default', ttl: t.ttlSeconds * 1000, limit: t.limit }] };
      },
    }),

    CommonModule,
    AuditModule,
    StorageModule,
    UsersModule,
    AuthModule,
    SubscriptionsModule,
    BrandsModule,
    MediaModule,
    PostsModule,
    NotificationsModule,
    AiModule,
    SocialAccountsModule,
    PublishingModule,
    SchedulerModule,
    CampaignsModule,
    AnalyticsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
