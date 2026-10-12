import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QUEUES } from '../common/queues';
import { PostPlatform } from '../posts/entities/post-platform.entity';
import { PostsModule } from '../posts/posts.module';
import { PublishingModule } from '../publishing/publishing.module';
import { ScheduledPost } from './entities/scheduled-post.entity';
import { SchedulerController } from './scheduler.controller';
import { SchedulerProcessor } from './scheduler.processor';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [TypeOrmModule.forFeature([ScheduledPost, PostPlatform]), BullModule.registerQueue({ name: QUEUES.SCHEDULER }), PostsModule, PublishingModule],
  controllers: [SchedulerController],
  providers: [SchedulerService, SchedulerProcessor],
  exports: [SchedulerService],
})
export class SchedulerModule {}
