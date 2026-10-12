import { ClassSerializerInterceptor, Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NextFunction, Request, Response, json, urlencoded } from 'express';
import { existsSync } from 'fs';
import helmet from 'helmet';
import { extname, join, resolve } from 'path';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import type { AppConfig, StorageConfig } from './config/configuration';

/** HTTP pipeline shared by main.ts and the e2e tests. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  const appConfig = config.getOrThrow<AppConfig>('app');
  const storage = config.getOrThrow<StorageConfig>('storage');

  app.set('trust proxy', 1);
  app.use(
    helmet({
      // Media under /uploads is embedded by the web/mobile apps on other origins.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.enableCors({
    origin: appConfig.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With', 'Accept'],
    credentials: false, // bearer tokens only - no cookies
    maxAge: 86400,
  });
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  if (storage.driver === 'local') {
    app.useStaticAssets(resolve(storage.localPath), {
      prefix: '/uploads',
      index: false,
      dotfiles: 'deny',
      maxAge: '7d',
      setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
    });
  }

  serveWebApp(app, appConfig.webDistPath);

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  const reflector = app.get(Reflector);
  // Order matters: ResponseInterceptor wraps the raw result, then the serializer strips @Exclude() fields.
  app.useGlobalInterceptors(new ClassSerializerInterceptor(reflector), new ResponseInterceptor(reflector));
  app.enableShutdownHooks();
}

/**
 * Serves the built Angular app from this server, so API + UI run as one app
 * on one port. Skipped when the build is missing (e.g. during development,
 * where `ng serve` runs separately and proxies /api here).
 */
function serveWebApp(app: NestExpressApplication, distPath: string): void {
  if (!distPath) return;
  const root = resolve(distPath);
  const indexHtml = join(root, 'index.html');
  if (!existsSync(indexHtml)) return;

  // File names are content-hashed by the Angular build, so they can be cached for long.
  app.useStaticAssets(root, { index: false, maxAge: '30d', dotfiles: 'deny' });
  // Client-side routes (/dashboard, /admin/ai-settings...) all load index.html.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const isPage = (req.method === 'GET' || req.method === 'HEAD') && !/^\/(api|uploads)(\/|$)/.test(req.path) && !extname(req.path);
    if (!isPage) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
  Logger.log(`Serving web app from ${root}`, 'WebApp');
}
