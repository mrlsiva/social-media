import { Injectable, Logger } from '@nestjs/common';

export interface PushMessage {
  tokens: string[];
  title: string;
  body?: string | null;
  data?: Record<string, string>;
}

/**
 * Push delivery abstraction (FCM / APNs). Plug a real implementation in
 * NotificationsModule once Firebase credentials are available.
 */
export abstract class PushSender {
  abstract readonly configured: boolean;
  abstract send(message: PushMessage): Promise<void>;
}

/** Default: push not configured. Notifications are still stored and served by the REST API. */
@Injectable()
export class NullPushSender extends PushSender {
  readonly configured = false;
  private readonly logger = new Logger(NullPushSender.name);

  async send(message: PushMessage): Promise<void> {
    this.logger.debug(`Push provider not configured; skipped push to ${message.tokens.length} device(s)`);
  }
}
