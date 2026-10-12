import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BrandAccessService } from '../brands/brand-access.service';
import { AuthUser, CurrentUser } from '../common/decorators/auth.decorators';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { ApiEnvelope, ApiPaginatedEnvelope, ApiStandardErrors } from '../common/swagger/api-responses';
import { CalendarQueryDto, CreatePostDto, HashtagQueryDto, PostQueryDto, PostResponseDto, UpdatePostDto } from './dto/post.dto';
import { HashtagsService } from './hashtags.service';
import { PostsService } from './posts.service';

@ApiTags('Posts & Reels')
@ApiBearerAuth()
@ApiStandardErrors()
@Controller()
export class PostsController {
  constructor(
    private readonly posts: PostsService,
    private readonly hashtags: HashtagsService,
    private readonly access: BrandAccessService,
  ) {}

  @Get('posts')
  @ApiOperation({ summary: 'List posts/reels (filter by brand, status, type, campaign, platform, date range)' })
  @ApiPaginatedEnvelope(PostResponseDto)
  list(@CurrentUser() user: AuthUser, @Query() query: PostQueryDto) {
    return this.posts.list(user.id, query);
  }

  @Get('posts/calendar')
  @ApiOperation({ summary: 'Calendar events between two dates (max 93 days)' })
  calendar(@CurrentUser() user: AuthUser, @Query() query: CalendarQueryDto) {
    return this.posts.calendar(user.id, query);
  }

  @Post('posts')
  @ApiOperation({ summary: 'Create a draft post or reel (image, carousel, video, reel)' })
  @ApiEnvelope(PostResponseDto)
  @ResponseMessage('Post saved as draft')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePostDto) {
    return this.posts.create(user.id, dto);
  }

  @Get('posts/:id')
  @ApiOperation({ summary: 'Get a post with media, platform statuses and reel data' })
  @ApiEnvelope(PostResponseDto)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.posts.findOne(user.id, id);
  }

  @Patch('posts/:id')
  @ApiOperation({ summary: 'Edit a post (not allowed while publishing or once fully published)' })
  @ApiEnvelope(PostResponseDto)
  @ResponseMessage('Post updated')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePostDto) {
    return this.posts.update(user.id, id, dto);
  }

  @Post('posts/:id/duplicate')
  @ApiOperation({ summary: 'Duplicate a post as a new draft' })
  @ApiEnvelope(PostResponseDto)
  @ResponseMessage('Post duplicated')
  duplicate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.posts.duplicate(user.id, id);
  }

  @Delete('posts/:id')
  @ApiOperation({ summary: 'Delete a post (cancels any pending schedule)' })
  @ApiEnvelope()
  @ResponseMessage('Post deleted')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.posts.remove(user.id, id);
    return null;
  }

  @Get('brands/:brandId/hashtags')
  @ApiOperation({ summary: "Brand's most used hashtags (for suggestions)" })
  async hashtagLibrary(@CurrentUser() user: AuthUser, @Param('brandId', ParseUUIDPipe) brandId: string, @Query() query: HashtagQueryDto) {
    await this.access.assert(user.id, brandId);
    return this.hashtags.list(brandId, query);
  }
}
