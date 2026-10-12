import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JOBS, QUEUES } from '../common/queues';
import { AIImageService } from './ai-image.service';
import { AIVideoService } from './ai-video.service';

interface AiJobData {
  generationId: string;
  attempt?: number;
}

@Processor(QUEUES.AI, { concurrency: 4 })
export class AiProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessor.name);

  constructor(
    private readonly images: AIImageService,
    private readonly videos: AIVideoService,
  ) {
    super();
  }

  async process(job: Job<AiJobData>): Promise<void> {
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    this.logger.log({ job: job.name, generationId: job.data.generationId, attempt: job.attemptsMade + 1 }, 'AI job started');
    switch (job.name) {
      case JOBS.AI_IMAGE:
        return this.images.process(job.data.generationId, isFinalAttempt);
      case JOBS.AI_VIDEO_START:
        return this.videos.start(job.data.generationId, isFinalAttempt);
      case JOBS.AI_VIDEO_POLL:
        return this.videos.poll(job.data.generationId, job.data.attempt ?? 1);
      default:
        this.logger.warn(`Unknown AI job: ${job.name}`);
    }
  }
}
