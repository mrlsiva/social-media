import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrandMember } from '../brands/entities/brand-member.entity';
import { QUEUES } from '../common/queues';
import { PublishersModule } from '../publishing/publishers.module';
import { OAuthState } from './entities/oauth-state.entity';
import { SocialAccount } from './entities/social-account.entity';
import { SocialAccountToken } from './entities/social-account-token.entity';
import { SocialAccountsController } from './social-accounts.controller';
import { SocialAccountsService } from './social-accounts.service';
import { TokenRefreshProcessor } from './token-refresh.processor';
import { TokenService } from './token.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SocialAccount, SocialAccountToken, OAuthState, BrandMember]),
    BullModule.registerQueue({ name: QUEUES.MAINTENANCE }),
    PublishersModule,
  ],
  controllers: [SocialAccountsController],
  providers: [SocialAccountsService, TokenService, TokenRefreshProcessor],
  exports: [SocialAccountsService, TokenService, PublishersModule],
})
export class SocialAccountsModule {}
