import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { JOBS, QUEUES } from '../common/queues';
import { SchedulerService } from './scheduler.service';

@Processor(QUEUES.SCHEDULER, { concurrency: 2 })
export class SchedulerProcessor extends WorkerHost {
  constructor(private readonly scheduler: SchedulerService) {
    super();
  }

  async process(job: Job<{ scheduledPostId?: string; scheduledAt?: string }>): Promise<void> {
    if (job.name === JOBS.SCHEDULED_POST && job.data.scheduledPostId) {
      await this.scheduler.trigger(job.data.scheduledPostId, job.data.scheduledAt);
    } else if (job.name === JOBS.SCHEDULE_SWEEP) {
      await this.scheduler.sweep();
    }
  }
}
