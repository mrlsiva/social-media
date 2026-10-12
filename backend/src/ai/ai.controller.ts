import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiAcceptedResponse, ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser } from '../common/decorators/auth.decorators';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { ApiStandardErrors } from '../common/swagger/api-responses';
import { AiGenerationsService } from './ai-generations.service';
import { AIImageService } from './ai-image.service';
import { AiTextService } from './ai-text.service';
import { AIVideoService } from './ai-video.service';
import {
  AiGenerationQueryDto,
  GenerateCaptionDto,
  GenerateHashtagsDto,
  GenerateIdeasDto,
  GenerateImageDto,
  GeneratePlatformContentDto,
  GenerateReelScriptDto,
  GenerateVideoDto,
  SaveGenerationDto,
} from './dto/ai.dto';
import { AiGenerationType } from '../common/enums';

const AI_THROTTLE = { default: { limit: 30, ttl: 60_000 } };

@ApiTags('AI')
@ApiBearerAuth()
@ApiStandardErrors()
@Throttle(AI_THROTTLE)
@Controller('ai')
export class AiController {
  constructor(
    private readonly text: AiTextService,
    private readonly images: AIImageService,
    private readonly videos: AIVideoService,
    private readonly generations: AiGenerationsService,
  ) {}

  @Post('caption')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate caption variants for a brand' })
  @ResponseMessage('Captions generated')
  caption(@CurrentUser() user: AuthUser, @Body() dto: GenerateCaptionDto) {
    return this.text.caption(user.id, dto);
  }

  @Post('hashtags')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate relevant hashtags' })
  @ResponseMessage('Hashtags generated')
  hashtags(@CurrentUser() user: AuthUser, @Body() dto: GenerateHashtagsDto) {
    return this.text.hashtags(user.id, dto);
  }

  @Post('post-ideas')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate post ideas' })
  @ResponseMessage('Post ideas generated')
  postIdeas(@CurrentUser() user: AuthUser, @Body() dto: GenerateIdeasDto) {
    return this.text.postIdeas(user.id, dto);
  }

  @Post('reel-ideas')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate reel / short video concepts' })
  @ResponseMessage('Reel ideas generated')
  reelIdeas(@CurrentUser() user: AuthUser, @Body() dto: GenerateIdeasDto) {
    return this.text.reelIdeas(user.id, dto);
  }

  @Post('reel-script')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a reel script (hook, main content, CTA, ending, overlays, voice-over)' })
  @ResponseMessage('Reel script generated')
  reelScript(@CurrentUser() user: AuthUser, @Body() dto: GenerateReelScriptDto) {
    return this.text.reelScript(user.id, dto);
  }

  @Post('platform-content')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate natively optimised copy per platform (Instagram, Facebook, LinkedIn, YouTube)' })
  @ResponseMessage('Platform content generated')
  platformContent(@CurrentUser() user: AuthUser, @Body() dto: GeneratePlatformContentDto) {
    return this.text.platformContent(user.id, dto);
  }

  @Post('image')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Start AI image generation (async). Poll GET /ai/images/:jobId' })
  @ApiAcceptedResponse({ schema: { example: { success: true, message: 'Image generation started', data: { jobId: '...', status: 'processing' }, meta: {} } } })
  @ResponseMessage('Image generation started')
  image(@CurrentUser() user: AuthUser, @Body() dto: GenerateImageDto) {
    return this.images.request(user.id, dto);
  }

  @Get('images/:jobId')
  @ApiOperation({ summary: 'AI image job status and results' })
  imageStatus(@CurrentUser() user: AuthUser, @Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.images.status(user.id, jobId);
  }

  @Post('images/:jobId/regenerate')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Regenerate with the same inputs (new job)' })
  @ResponseMessage('Image regeneration started')
  regenerateImage(@CurrentUser() user: AuthUser, @Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.images.regenerate(user.id, jobId);
  }

  @Post('images/:jobId/save')
  @ApiOperation({ summary: 'Save generated image(s) to the brand media library (use the returned media id in posts)' })
  @ResponseMessage('Saved to media library')
  saveImage(@CurrentUser() user: AuthUser, @Param('jobId', ParseUUIDPipe) jobId: string, @Body() dto: SaveGenerationDto) {
    return this.images.saveToLibrary(user.id, jobId, dto);
  }

  @Post('video')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Alias of POST /ai/videos' })
  @ResponseMessage('Video generation started')
  videoAlias(@CurrentUser() user: AuthUser, @Body() dto: GenerateVideoDto) {
    return this.videos.request(user.id, dto);
  }

  @Post('videos')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Start AI video/reel generation (async job). Poll GET /ai/videos/:jobId' })
  @ApiAcceptedResponse({ schema: { example: { success: true, message: 'Video generation started', data: { jobId: '...', status: 'processing' }, meta: {} } } })
  @ResponseMessage('Video generation started')
  video(@CurrentUser() user: AuthUser, @Body() dto: GenerateVideoDto) {
    return this.videos.request(user.id, dto);
  }

  @Get('videos/:jobId')
  @ApiOperation({ summary: 'AI video job status: processing | completed (videoUrl) | failed' })
  videoStatus(@CurrentUser() user: AuthUser, @Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.videos.status(user.id, jobId);
  }

  @Get('generations')
  @ApiOperation({ summary: 'AI generation history' })
  history(@CurrentUser() user: AuthUser, @Query() query: AiGenerationQueryDto) {
    return this.generations.list(user.id, query);
  }

  @Get('generations/:id')
  @ApiOperation({ summary: 'Get one AI generation (input + output)' })
  generation(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.generations.getForUser(user.id, id);
  }

  @Get('providers')
  @ApiOperation({ summary: 'Which AI capabilities are configured on the server' })
  providers() {
    return {
      text: { provider: this.text.providerInfo.name, model: this.text.providerInfo.model, configured: this.text.providerInfo.isConfigured() },
      image: { provider: this.images.providerInfo.name, model: this.images.providerInfo.model, configured: this.images.providerInfo.isConfigured() },
      video: {
        provider: this.videos.providerInfo.name,
        model: this.videos.providerInfo.model,
        configured: this.videos.providerInfo.isConfigured(),
        supportedDurations: this.videos.providerInfo.supportedDurations,
      },
      types: Object.values(AiGenerationType),
    };
  }
}
