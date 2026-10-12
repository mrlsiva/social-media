import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { IsNull, Repository } from 'typeorm';
import { PaginatedResult } from '../common/dto/paginated-result';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { NotificationType } from '../common/enums';
import { JOBS, QUEUES } from '../common/queues';
import { NotificationQueryDto } from './dto/notification.dto';
import { Notification } from './entities/notification.entity';
import { PushSender } from './push/push-sender';
import { withQueueTimeout } from '../common/utils/queue';

export interface NotifyInput {
  userId: string;
  brandId?: string | null;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly queue: Queue,
    private readonly push: PushSender,
  ) {}

  /** Stores the in-app notification and (if configured) queues push delivery. Never throws. */
  async notify(input: NotifyInput): Promise<void> {
    try {
      const saved = await this.repo.save(
        this.repo.create({
          userId: input.userId,
          brandId: input.brandId ?? null,
          type: input.type,
          title: input.title.slice(0, 255),
          body: input.body ?? null,
          data: input.data ?? null,
        }),
      );
      if (this.push.configured) {
        await withQueueTimeout(this.queue.add(JOBS.PUSH_NOTIFICATION, { notificationId: saved.id }, { removeOnComplete: 1000, removeOnFail: 1000, attempts: 3 }));
      }
    } catch (err) {
      this.logger.warn({ err, type: input.type }, 'Failed to create notification');
    }
  }

  async list(userId: string, query: NotificationQueryDto): Promise<PaginatedResult<Notification>> {
    const [items, total] = await this.repo.findAndCount({
      where: { userId, ...(query.unreadOnly ? { readAt: IsNull() } : {}), ...(query.brandId ? { brandId: query.brandId } : {}) },
      order: { createdAt: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    return new PaginatedResult(items, total, query.page, query.limit);
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    return { count: await this.repo.count({ where: { userId, readAt: IsNull() } }) };
  }

  async markRead(userId: string, id: string): Promise<void> {
    const result = await this.repo.update({ id, userId }, { readAt: new Date() });
    if (!result.affected) throw AppException.notFound(ErrorCode.NOT_FOUND, 'Notification not found');
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.repo.update({ userId, readAt: IsNull() }, { readAt: new Date() });
    return { updated: result.affected ?? 0 };
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.repo.delete({ id, userId });
    if (!result.affected) throw AppException.notFound(ErrorCode.NOT_FOUND, 'Notification not found');
  }

  findById(id: string): Promise<Notification | null> {
    return this.repo.findOne({ where: { id } });
  }
}
