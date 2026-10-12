import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { UsageLimit } from './entities/usage-limit.entity';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { UsageService } from './usage.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Subscription, SubscriptionPlan, UsageLimit])],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, UsageService],
  exports: [SubscriptionsService, UsageService],
})
export class SubscriptionsModule {}
