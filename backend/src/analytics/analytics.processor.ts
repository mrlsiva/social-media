import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { JOBS, QUEUES } from '../common/queues';
import { AnalyticsSyncService } from './analytics-sync.service';

@Processor(QUEUES.ANALYTICS, { concurrency: 1 })
export class AnalyticsProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  constructor(
    @InjectQueue(QUEUES.ANALYTICS) private readonly queue: Queue,
    private readonly sync: AnalyticsSyncService,
  ) {
    super();
  }

  onModuleInit(): void {
    // Not awaited: BullMQ waits for Redis, which must never block application startup.
    void this.queue
      .upsertJobScheduler('analytics-sync-all', { every: 6 * 3600_000 }, { name: JOBS.ANALYTICS_SYNC_ALL, opts: { removeOnComplete: 10, removeOnFail: 50 } })
      .catch((err: unknown) => this.logger.warn(`Could not register analytics sync job: ${(err as Error).message}`));
  }

  async process(job: Job<{ brandId?: string }>): Promise<unknown> {
    if (job.name === JOBS.ANALYTICS_SYNC_ALL) return this.sync.syncAll();
    if (job.name === JOBS.ANALYTICS_SYNC_BRAND && job.data.brandId) return this.sync.syncBrand(job.data.brandId);
    return null;
  }
}
