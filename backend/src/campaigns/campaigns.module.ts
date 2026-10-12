import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { BrandSetting } from '../brands/entities/brand-setting.entity';
import { PostsModule } from '../posts/posts.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { SocialAccount } from '../social-accounts/entities/social-account.entity';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { Campaign } from './entities/campaign.entity';
import { CampaignPost } from './entities/campaign-post.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Campaign, CampaignPost, SocialAccount, BrandSetting]), PostsModule, SchedulerModule, AiModule],
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
