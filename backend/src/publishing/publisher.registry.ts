import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { SocialPlatform } from '../common/enums';
import { PLATFORM_NAMES } from './base.publisher';
import { SocialPublisher } from './interfaces/social-publisher.interface';

export const SOCIAL_PUBLISHERS = Symbol('SOCIAL_PUBLISHERS');

/** Resolves the publisher implementation for a platform. */
@Injectable()
export class PublisherRegistry {
  private readonly byPlatform: Map<SocialPlatform, SocialPublisher>;

  constructor(@Inject(SOCIAL_PUBLISHERS) publishers: SocialPublisher[]) {
    this.byPlatform = new Map(publishers.map((p) => [p.platform, p]));
  }

  get(platform: SocialPlatform | string): SocialPublisher {
    const publisher = this.byPlatform.get(platform as SocialPlatform);
    if (!publisher) {
      throw new AppException(ErrorCode.SOCIAL_PLATFORM_UNSUPPORTED, `${PLATFORM_NAMES[platform] ?? platform} is not supported yet`);
    }
    return publisher;
  }

  getConfigured(platform: SocialPlatform | string): SocialPublisher {
    const publisher = this.get(platform);
    if (!publisher.isConfigured()) {
      throw new AppException(
        ErrorCode.SOCIAL_PLATFORM_NOT_CONFIGURED,
        `${publisher.displayName} integration is not configured on the server (OAuth app credentials missing)`,
        503,
      );
    }
    return publisher;
  }

  /** Every platform, including planned ones, with availability flags (for the UI). */
  describe() {
    return Object.values(SocialPlatform).map((platform) => {
      const publisher = this.byPlatform.get(platform);
      return {
        platform,
        name: PLATFORM_NAMES[platform] ?? platform,
        supported: !!publisher,
        configured: publisher?.isConfigured() ?? false,
        capabilities: publisher?.capabilities ?? null,
      };
    });
  }
}
