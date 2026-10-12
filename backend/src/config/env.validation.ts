import * as Joi from 'joi';

/**
 * Validates environment variables at boot so misconfiguration fails fast.
 * Third-party credentials are optional: integrations without credentials
 * report themselves as "not configured" instead of crashing the API.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  APP_PORT: Joi.number().port().default(3000),
  APP_URL: Joi.string().uri().default('http://localhost:3000'),
  WEB_APP_URL: Joi.string().uri().default('http://localhost:4200'),
  WEB_DIST_PATH: Joi.string().allow('').optional(),

  DATABASE_HOST: Joi.string().required(),
  DATABASE_PORT: Joi.number().port().default(3306),
  DATABASE_USER: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().allow('').default(''),
  DATABASE_NAME: Joi.string().required(),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),
  TOKEN_ENCRYPTION_KEY: Joi.string()
    .base64()
    .custom((value: string, helpers) =>
      Buffer.from(value, 'base64').length === 32 ? value : helpers.error('any.invalid'),
    )
    .required()
    .messages({ 'any.invalid': 'TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as base64' }),

  STORAGE_DRIVER: Joi.string().valid('local', 's3').default('local'),
  REDIS_HOST: Joi.string().default('127.0.0.1'),
  REDIS_PORT: Joi.number().port().default(6379),
}).unknown(true);
