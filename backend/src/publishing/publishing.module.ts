import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QUEUES } from '../common/queues';
import { Media } from '../media/entities/media.entity';
import { PostPlatform } from '../posts/entities/post-platform.entity';
import { PostsModule } from '../posts/posts.module';
import { SocialAccount } from '../social-accounts/entities/social-account.entity';
import { SocialAccountsModule } from '../social-accounts/social-accounts.module';
import { PublishingJob } from './entities/publishing-job.entity';
import { PublishingLog } from './entities/publishing-log.entity';
import { PublishMediaFactory } from './publish-media.factory';
import { PublishingController } from './publishing.controller';
import { PublishingProcessor } from './publishing.processor';
import { PublishingService } from './publishing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PublishingJob, PublishingLog, PostPlatform, SocialAccount, Media]),
    BullModule.registerQueue({ name: QUEUES.PUBLISHING }),
    PostsModule,
    SocialAccountsModule,
  ],
  controllers: [PublishingController],
  providers: [PublishingService, PublishingProcessor, PublishMediaFactory],
  exports: [PublishingService, PublishMediaFactory],
})
export class PublishingModule {}
