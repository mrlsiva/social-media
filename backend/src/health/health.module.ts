import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '../common/queues';
import { HealthController } from './health.controller';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.MAINTENANCE })],
  controllers: [HealthController],
})
export class HealthModule {}
