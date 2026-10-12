import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSession } from '../auth/entities/user-session.entity';
import { QUEUES } from '../common/queues';
import { Notification } from './entities/notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';
import { NullPushSender, PushSender } from './push/push-sender';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Notification, UserSession]), BullModule.registerQueue({ name: QUEUES.NOTIFICATIONS })],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsProcessor, { provide: PushSender, useClass: NullPushSender }],
  exports: [NotificationsService],
})
export class NotificationsModule {}
