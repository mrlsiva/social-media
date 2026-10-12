import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reel } from '../reels/entities/reel.entity';
import { ReelMedia } from '../reels/entities/reel-media.entity';
import { ScheduledPost } from '../scheduler/entities/scheduled-post.entity';
import { SocialAccount } from '../social-accounts/entities/social-account.entity';
import { Hashtag } from './entities/hashtag.entity';
import { Post } from './entities/post.entity';
import { PostMedia } from './entities/post-media.entity';
import { PostPlatform } from './entities/post-platform.entity';
import { HashtagsService } from './hashtags.service';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

/**
 * Posts and reels (a reel is a post with content_type = "reel" plus a 1:1 `reels` row).
 * Publishing/scheduling endpoints live in their own modules to keep dependencies one-way.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Post, PostMedia, PostPlatform, Hashtag, Reel, ReelMedia, ScheduledPost, SocialAccount])],
  controllers: [PostsController],
  providers: [PostsService, HashtagsService],
  exports: [PostsService, HashtagsService],
})
export class PostsModule {}
