import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import configuration from '../config/configuration';
import { buildTypeOrmOptions } from './typeorm.options';

loadEnv();

/** DataSource used by the TypeORM CLI (migrations) and the seed script. */
const AppDataSource = new DataSource(buildTypeOrmOptions(configuration().database));
export default AppDataSource;
