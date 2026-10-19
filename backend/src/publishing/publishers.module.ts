import { Module } from '@nestjs/common';
import { FacebookPublisher } from './facebook/facebook.publisher';
import { InstagramGraphClient } from './instagram/instagram-graph.client';
import { InstagramPublisher } from './instagram/instagram.publisher';
import { LinkedInPublisher } from './linkedin/linkedin.publisher';
import { MetaGraphClient } from './meta/meta-graph.client';
import { PublisherRegistry, SOCIAL_PUBLISHERS } from './publisher.registry';
import { YoutubePublisher } from './youtube/youtube.publisher';

/**
 * Platform integrations. To add X / TikTok / Pinterest / Threads:
 * implement SocialPublisher, add the class below and to the SOCIAL_PUBLISHERS factory.
 */
@Module({
  providers: [
    MetaGraphClient,
    InstagramGraphClient,
    InstagramPublisher,
    FacebookPublisher,
    YoutubePublisher,
    LinkedInPublisher,
    {
      provide: SOCIAL_PUBLISHERS,
      inject: [InstagramPublisher, FacebookPublisher, YoutubePublisher, LinkedInPublisher],
      useFactory: (...publishers: unknown[]) => publishers,
    },
    PublisherRegistry,
  ],
  exports: [PublisherRegistry],
})
export class PublishersModule {}
