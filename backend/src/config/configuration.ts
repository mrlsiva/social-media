export interface AppConfig {
  env: string;
  name: string;
  port: number;
  url: string;
  webAppUrl: string;
  corsOrigins: string[];
  logLevel: string;
  /** Built Angular app (index.html) to serve from this server; '' disables it. */
  webDistPath: string;
}

export interface DatabaseConfig {
  type: 'mysql' | 'mariadb';
  host: string;
  port: number;
  user: string;
  password: string;
  name: string;
  logging: boolean;
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtRefreshSecret: string;
  jwtRefreshExpiresIn: string;
  tokenEncryptionKey: string;
}

export interface AiConfig {
  textProvider: string;
  imageProvider: string;
  videoProvider: string;
  openai: {
    apiKey: string;
    textModel: string;
    imageModel: string;
    videoModel: string;
  };
  nvidia: {
    apiKey: string;
    textModel: string;
    imageModel: string;
  };
  custom: {
    apiKey: string;
    baseUrl: string;
    textModel: string;
    imageModel: string;
  };
}

export interface SocialConfig {
  meta: { appId: string; appSecret: string; redirectUri: string; graphVersion: string };
  google: { clientId: string; clientSecret: string; redirectUri: string };
  linkedin: { clientId: string; clientSecret: string; redirectUri: string; apiVersion: string };
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
}

export interface StorageConfig {
  driver: 'local' | 's3';
  localPath: string;
  maxImageSizeMb: number;
  maxVideoSizeMb: number;
  s3: {
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    publicUrl: string;
  };
}

export interface ThrottleConfig {
  ttlSeconds: number;
  limit: number;
}

export interface Configuration {
  app: AppConfig;
  database: DatabaseConfig;
  auth: AuthConfig;
  ai: AiConfig;
  social: SocialConfig;
  redis: RedisConfig;
  storage: StorageConfig;
  throttle: ThrottleConfig;
}

const int = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export default (): Configuration => {
  const env = process.env;
  const webAppUrl = env.WEB_APP_URL ?? 'http://localhost:4200';
  return {
    app: {
      env: env.NODE_ENV ?? 'development',
      name: env.APP_NAME ?? 'SocialPilot AI',
      port: int(env.APP_PORT, 3000),
      url: (env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
      webAppUrl: webAppUrl.replace(/\/$/, ''),
      corsOrigins: [webAppUrl, ...(env.CORS_ORIGINS ?? '').split(',')]
        .map((o) => o.trim().replace(/\/$/, ''))
        .filter(Boolean),
      logLevel: env.LOG_LEVEL ?? 'info',
      webDistPath: env.WEB_DIST_PATH ?? '../web/dist/web/browser',
    },
    database: {
      type: env.DATABASE_TYPE === 'mariadb' ? 'mariadb' : 'mysql',
      host: env.DATABASE_HOST ?? '127.0.0.1',
      port: int(env.DATABASE_PORT, 3306),
      user: env.DATABASE_USER ?? 'root',
      password: env.DATABASE_PASSWORD ?? '',
      name: env.DATABASE_NAME ?? 'social_media_platform',
      logging: env.DATABASE_LOGGING === 'true',
    },
    auth: {
      jwtSecret: env.JWT_SECRET ?? '',
      jwtExpiresIn: env.JWT_EXPIRES_IN ?? '15m',
      jwtRefreshSecret: env.JWT_REFRESH_SECRET ?? '',
      jwtRefreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN ?? '30d',
      tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY ?? '',
    },
    ai: {
      textProvider: env.AI_TEXT_PROVIDER ?? 'openai',
      imageProvider: env.AI_IMAGE_PROVIDER ?? 'openai',
      videoProvider: env.AI_VIDEO_PROVIDER ?? 'openai',
      openai: {
        apiKey: env.OPENAI_API_KEY ?? '',
        textModel: env.OPENAI_TEXT_MODEL ?? 'gpt-4.1-mini',
        imageModel: env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1',
        videoModel: env.OPENAI_VIDEO_MODEL ?? 'sora-2',
      },
      nvidia: {
        apiKey: env.NVIDIA_API_KEY ?? '',
        textModel: env.NVIDIA_TEXT_MODEL ?? 'nvidia/nemotron-3-super-120b-a12b',
        imageModel: env.NVIDIA_IMAGE_MODEL ?? 'black-forest-labs/flux.1-dev',
      },
      custom: {
        apiKey: env.CUSTOM_AI_API_KEY ?? '',
        baseUrl: env.CUSTOM_AI_BASE_URL ?? '',
        textModel: env.CUSTOM_AI_TEXT_MODEL ?? '',
        imageModel: env.CUSTOM_AI_IMAGE_MODEL ?? '',
      },
    },
    social: {
      meta: {
        appId: env.META_APP_ID ?? '',
        appSecret: env.META_APP_SECRET ?? '',
        redirectUri: env.META_REDIRECT_URI ?? '',
        graphVersion: env.META_GRAPH_VERSION ?? 'v25.0',
      },
      google: {
        clientId: env.GOOGLE_CLIENT_ID ?? '',
        clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
        redirectUri: env.GOOGLE_REDIRECT_URI ?? '',
      },
      linkedin: {
        clientId: env.LINKEDIN_CLIENT_ID ?? '',
        clientSecret: env.LINKEDIN_CLIENT_SECRET ?? '',
        redirectUri: env.LINKEDIN_REDIRECT_URI ?? '',
        apiVersion: env.LINKEDIN_API_VERSION ?? '202608',
      },
    },
    redis: {
      host: env.REDIS_HOST ?? '127.0.0.1',
      port: int(env.REDIS_PORT, 6379),
      password: env.REDIS_PASSWORD || undefined,
      db: int(env.REDIS_DB, 0),
    },
    storage: {
      driver: env.STORAGE_DRIVER === 's3' ? 's3' : 'local',
      localPath: env.STORAGE_LOCAL_PATH ?? './uploads',
      maxImageSizeMb: int(env.MAX_IMAGE_SIZE_MB, 10),
      maxVideoSizeMb: int(env.MAX_VIDEO_SIZE_MB, 500),
      s3: {
        region: env.AWS_REGION ?? '',
        bucket: env.AWS_S3_BUCKET ?? '',
        accessKeyId: env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? '',
        publicUrl: env.AWS_S3_PUBLIC_URL ?? '',
      },
    },
    throttle: {
      ttlSeconds: int(env.THROTTLE_TTL_SECONDS, 60),
      limit: int(env.THROTTLE_LIMIT, 120),
    },
  };
};
