import * as mysql2 from 'mysql2';
import { join } from 'path';
import type { DataSourceOptions } from 'typeorm';
import type { DatabaseConfig } from '../config/configuration';

/**
 * mysql2 wrapper that pins every pooled connection to UTC. Without it, DB-side
 * defaults (CURRENT_TIMESTAMP / NOW()) use the server's local timezone while the
 * app reads/writes UTC (`timezone: 'Z'`), skewing created_at/updated_at.
 */
const utcMysqlDriver = {
  ...mysql2,
  createPool: (config: mysql2.PoolOptions) => {
    const pool = mysql2.createPool(config);
    pool.on('connection', (connection) => {
      connection.query("SET time_zone = '+00:00'");
    });
    return pool;
  },
};

/**
 * Shared TypeORM options for the Nest app and the migration CLI.
 * `synchronize` is always false: the schema is managed exclusively by migrations.
 */
export const buildTypeOrmOptions = (db: DatabaseConfig): DataSourceOptions => ({
  type: db.type,
  driver: utcMysqlDriver,
  host: db.host,
  port: db.port,
  username: db.user,
  password: db.password,
  database: db.name,
  charset: 'utf8mb4_unicode_ci',
  timezone: 'Z',
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  migrationsTableName: 'migrations',
  synchronize: false,
  logging: db.logging ? ['query', 'error'] : ['error'],
  extra: { connectionLimit: 20 },
});
