import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export interface AuditEntry {
  action: string;
  userId?: string | null;
  brandId?: string | null;
  entityType?: string;
  entityId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

const SECRET_KEYS = /(password|token|secret|authorization|api[_-]?key)/i;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  /** Best-effort audit write: auditing must never break the main operation. */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.repo.save(
        this.repo.create({
        action: entry.action,
        userId: entry.userId ?? null,
        brandId: entry.brandId ?? null,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent?.slice(0, 500) ?? null,
        metadata: entry.metadata ? this.scrub(entry.metadata) : null,
        }),
      );
    } catch (err) {
      this.logger.warn({ err, action: entry.action }, 'Failed to write audit log');
    }
  }

  private scrub(data: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '[REDACTED]' : v]),
    );
  }
}
