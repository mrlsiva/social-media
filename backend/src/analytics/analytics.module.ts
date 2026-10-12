import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QUEUES } from '../common/queues';
import { Post } from '../posts/entities/post.entity';
import { PostPlatform } from '../posts/entities/post-platform.entity';
import { SocialAccount } from '../social-accounts/entities/social-account.entity';
import { SocialAccountsModule } from '../social-accounts/social-accounts.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsProcessor } from './analytics.processor';
import { AnalyticsService } from './analytics.service';
import { AnalyticsSyncService } from './analytics-sync.service';
import { Analytics } from './entities/analytics.entity';
import { PlatformAnalytics } from './entities/platform-analytics.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Analytics, PlatformAnalytics, PostPlatform, SocialAccount, Post]),
    BullModule.registerQueue({ name: QUEUES.ANALYTICS }),
    SocialAccountsModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsSyncService, AnalyticsProcessor],
})
export class AnalyticsModule {}
