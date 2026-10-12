import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators/auth.decorators';
import { RawResponse } from '../common/decorators/response-message.decorator';
import { QUEUES } from '../common/queues';

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectQueue(QUEUES.MAINTENANCE) private readonly queue: Queue,
  ) {}

  @Public()
  @SkipThrottle()
  @RawResponse()
  @Get()
  @ApiOperation({ summary: 'Liveness/readiness: database and Redis connectivity' })
  async check(@Res() res: Response) {
    const [database, redis] = await Promise.all([
      withTimeout(this.db.query('SELECT 1'), 3000).then(() => 'up').catch(() => 'down'),
      withTimeout(this.queue.getJobCounts('waiting'), 3000).then(() => 'up').catch(() => 'down'),
    ]);
    const ok = database === 'up';
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json({
      success: ok,
      message: ok ? (redis === 'up' ? 'OK' : 'Degraded: Redis unavailable (background jobs paused)') : 'Database unavailable',
      data: { database, redis, uptimeSeconds: Math.round(process.uptime()), timestamp: new Date().toISOString() },
      meta: {},
    });
  }
}
