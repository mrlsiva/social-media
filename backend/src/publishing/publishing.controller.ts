import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/auth.decorators';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { ApiEnvelope, ApiStandardErrors } from '../common/swagger/api-responses';
import { PublishBatchResponseDto, PublishingJobQueryDto, PublishNowDto } from './dto/publishing.dto';
import { PublishingService } from './publishing.service';

@ApiTags('Publishing')
@ApiBearerAuth()
@ApiStandardErrors()
@Controller()
export class PublishingController {
  constructor(private readonly publishing: PublishingService) {}

  @Post('posts/:id/publish')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Publish now to selected platforms (or all unpublished ones). Returns one job per platform.' })
  @ApiEnvelope(PublishBatchResponseDto)
  @ResponseMessage('Publishing started')
  publish(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PublishNowDto) {
    return this.publishing.publishNow(user.id, id, dto);
  }

  @Post('posts/:id/publish-all')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '"Publish to All": every selected platform, each as an independent job' })
  @ApiEnvelope(PublishBatchResponseDto)
  @ResponseMessage('Publishing to all platforms started')
  publishAll(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.publishing.publishAll(user.id, id);
  }

  @Post('posts/:id/retry-failed')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Retry only the platforms that failed' })
  @ApiEnvelope(PublishBatchResponseDto)
  @ResponseMessage('Retrying failed platforms')
  retryFailed(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.publishing.retryFailed(user.id, id);
  }

  @Get('posts/:id/publishing-status')
  @ApiOperation({ summary: 'Per-platform publishing status (poll while status is "publishing")' })
  status(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.publishing.platformStatus(user.id, id);
  }

  @Post('publishing/:jobId/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Retry a single failed publishing job' })
  @ApiEnvelope(PublishBatchResponseDto)
  @ResponseMessage('Retry queued')
  retry(@CurrentUser() user: AuthUser, @Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.publishing.retryJob(user.id, jobId);
  }

  @Get('publishing/jobs')
  @ApiOperation({ summary: 'Publishing job history (filter by post, batch, status, platform)' })
  jobs(@CurrentUser() user: AuthUser, @Query() query: PublishingJobQueryDto) {
    return this.publishing.listJobs(user.id, query);
  }

  @Get('publishing/jobs/:jobId')
  @ApiOperation({ summary: 'Publishing job with step-by-step logs and error details' })
  job(@CurrentUser() user: AuthUser, @Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.publishing.getJob(user.id, jobId);
  }
}
