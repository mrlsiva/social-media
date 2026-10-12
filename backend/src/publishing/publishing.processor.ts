import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JOBS, QUEUES } from '../common/queues';
import { PublishingService } from './publishing.service';

/** Executes per-platform publishing jobs (one BullMQ job per post-platform). */
@Processor(QUEUES.PUBLISHING, { concurrency: 5 })
export class PublishingProcessor extends WorkerHost {
  private readonly logger = new Logger(PublishingProcessor.name);

  constructor(private readonly publishing: PublishingService) {
    super();
  }

  async process(job: Job<{ publishingJobId: string }>): Promise<void> {
    if (job.name !== JOBS.PUBLISH_PLATFORM) {
      this.logger.warn(`Unknown publishing job: ${job.name}`);
      return;
    }
    await this.publishing.processJob(job.data.publishingJobId, job.attemptsMade);
  }
}
