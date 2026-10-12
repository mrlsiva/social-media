import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Queue } from 'bullmq';
import { BrandAccessService } from '../brands/brand-access.service';
import { AuthUser, CurrentUser } from '../common/decorators/auth.decorators';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { JOBS, QUEUES } from '../common/queues';
import { ApiStandardErrors } from '../common/swagger/api-responses';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto, DashboardQueryDto } from './dto/analytics.dto';
import { withQueueTimeout } from '../common/utils/queue';

@ApiTags('Analytics & Dashboard')
@ApiBearerAuth()
@ApiStandardErrors()
@Controller()
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly access: BrandAccessService,
    @InjectQueue(QUEUES.ANALYTICS) private readonly queue: Queue,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard counters, upcoming posts and recent failures' })
  dashboard(@CurrentUser() user: AuthUser, @Query() query: DashboardQueryDto) {
    return this.analytics.dashboard(user.id, query.brandId);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Analytics for the user (all brands) or one brand: totals, daily reach/engagement, followers, platform comparison, best content' })
  overview(@CurrentUser() user: AuthUser, @Query() query: AnalyticsQueryDto) {
    return this.analytics.overview(user.id, query);
  }

  @Get('brands/:brandId/analytics')
  @ApiOperation({ summary: 'Analytics for one brand' })
  brand(@CurrentUser() user: AuthUser, @Param('brandId', ParseUUIDPipe) brandId: string, @Query() query: AnalyticsQueryDto) {
    return this.analytics.overview(user.id, { ...query, brandId });
  }

  @Get('analytics/posts/:postId')
  @ApiOperation({ summary: 'Per-platform metrics for a post' })
  post(@CurrentUser() user: AuthUser, @Param('postId', ParseUUIDPipe) postId: string) {
    return this.analytics.postAnalytics(user.id, postId);
  }

  @Get('analytics/campaigns/:campaignId')
  @ApiOperation({ summary: 'Campaign performance' })
  campaign(@CurrentUser() user: AuthUser, @Param('campaignId', ParseUUIDPipe) campaignId: string) {
    return this.analytics.campaignAnalytics(user.id, campaignId);
  }

  @Post('brands/:brandId/analytics/sync')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue an immediate metrics sync from the connected platforms' })
  @ResponseMessage('Analytics sync queued')
  async sync(@CurrentUser() user: AuthUser, @Param('brandId', ParseUUIDPipe) brandId: string) {
    await this.access.assert(user.id, brandId);
    try {
      const job = await withQueueTimeout(this.queue.add(JOBS.ANALYTICS_SYNC_BRAND, { brandId }, { jobId: `analytics_${brandId}_${Math.floor(Date.now() / 60_000)}`, removeOnComplete: 100, removeOnFail: 100 }));
      return { jobId: job.id, status: 'queued' };
    } catch {
      throw new AppException(ErrorCode.INTERNAL_ERROR, 'Background job queue is unavailable (is Redis running?)', 503);
    }
  }
}
