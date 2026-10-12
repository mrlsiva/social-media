import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Queue } from 'bullmq';
import { In, LessThan, Not, IsNull, Repository } from 'typeorm';
import { SocialAccountStatus } from '../common/enums';
import { JOBS, QUEUES } from '../common/queues';
import { SocialAccount } from './entities/social-account.entity';
import { SocialAccountToken } from './entities/social-account-token.entity';
import { TokenService } from './token.service';

const REFRESH_AHEAD_MS = 3 * 86_400_000;

/**
 * Background token maintenance (every 6 hours): refreshes tokens that expire soon
 * and flags accounts whose tokens expired and cannot be refreshed.
 */
@Processor(QUEUES.MAINTENANCE)
export class TokenRefreshProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(TokenRefreshProcessor.name);

  constructor(
    @InjectQueue(QUEUES.MAINTENANCE) private readonly queue: Queue,
    @InjectRepository(SocialAccountToken) private readonly tokens: Repository<SocialAccountToken>,
    @InjectRepository(SocialAccount) private readonly accounts: Repository<SocialAccount>,
    private readonly tokenService: TokenService,
  ) {
    super();
  }

  onModuleInit(): void {
    // Not awaited: BullMQ waits for Redis, which must never block application startup.
    void this.queue
      .upsertJobScheduler('token-refresh', { every: 6 * 3600_000 }, { name: JOBS.TOKEN_REFRESH, opts: { removeOnComplete: 10, removeOnFail: 50 } })
      .catch((err: unknown) => this.logger.warn(`Could not register token refresh job: ${(err as Error).message}`));
  }

  async process(job: Job): Promise<unknown> {
    if (job.name !== JOBS.TOKEN_REFRESH) return null;
    const expiring = await this.tokens.find({
      where: { expiresAt: LessThan(new Date(Date.now() + REFRESH_AHEAD_MS)) },
      select: { id: true, socialAccountId: true, expiresAt: true, refreshTokenEncrypted: true },
    });
    let refreshed = 0;
    let expired = 0;
    const accounts = await this.accounts.find({
      where: { id: In(expiring.map((t) => t.socialAccountId)), status: Not(SocialAccountStatus.REVOKED), deletedAt: IsNull() },
    });
    for (const token of expiring) {
      const account = accounts.find((a) => a.id === token.socialAccountId);
      if (!account) continue;
      const result = token.refreshTokenEncrypted ? await this.tokenService.refresh(account) : null;
      if (result) refreshed++;
      else if (token.expiresAt && token.expiresAt.getTime() <= Date.now()) {
        await this.tokenService.markExpired(account, 'Access token expired. Reconnect the account.');
        expired++;
      }
    }
    this.logger.log({ checked: expiring.length, refreshed, expired }, 'Token maintenance finished');
    return { checked: expiring.length, refreshed, expired };
  }
}
