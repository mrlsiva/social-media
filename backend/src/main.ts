import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);

  const appConfig = app.get(ConfigService).getOrThrow<AppConfig>('app');
  const swagger = new DocumentBuilder()
    .setTitle(`${appConfig.name} API`)
    .setDescription(
      [
        'REST API shared by the Angular web app and the Android/iOS apps.',
        '',
        '**Auth:** `Authorization: Bearer <accessToken>`. Access tokens are short-lived; call `POST /auth/refresh` with the refresh token (rotated on every use).',
        '',
        '**Envelope:** success `{ success: true, message, data, meta }`; error `{ success: false, message, error: { code, details? } }`.',
        '',
        '**Pagination:** list endpoints accept `?page=1&limit=20` and return `meta: { page, limit, total, totalPages }`.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addServer(appConfig.url)
    .build();
  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha', operationsSorter: 'alpha' },
  });

  await app.listen(appConfig.port);
  app.get(Logger).log(`API ready on ${appConfig.url}/api/v1 - docs at ${appConfig.url}/api/docs`);
}

void bootstrap();
