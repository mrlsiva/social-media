import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { IsNull, MoreThan, Not, Repository } from 'typeorm';
import { UserSession } from '../auth/entities/user-session.entity';
import { QUEUES } from '../common/queues';
import { NotificationsService } from './notifications.service';
import { PushSender } from './push/push-sender';

/** Delivers stored notifications to the user's registered mobile devices. */
@Processor(QUEUES.NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly push: PushSender,
    @InjectRepository(UserSession) private readonly sessions: Repository<UserSession>,
  ) {
    super();
  }

  async process(job: Job<{ notificationId: string }>): Promise<unknown> {
    const notification = await this.notifications.findById(job.data.notificationId);
    if (!notification) return null;
    const devices = await this.sessions.find({
      where: { userId: notification.userId, revokedAt: IsNull(), expiresAt: MoreThan(new Date()), pushToken: Not(IsNull()) },
      select: { id: true, pushToken: true },
    });
    const tokens = devices.map((d) => d.pushToken).filter((t): t is string => !!t);
    if (tokens.length === 0) return { delivered: 0 };
    await this.push.send({
      tokens,
      title: notification.title,
      body: notification.body,
      data: { notificationId: notification.id, type: notification.type, ...stringify(notification.data) },
    });
    return { delivered: tokens.length };
  }
}

const stringify = (data: Record<string, unknown> | null): Record<string, string> =>
  Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
