import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/auth.decorators';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { ApiEnvelope, ApiStandardErrors } from '../common/swagger/api-responses';
import { PostResponseDto } from '../posts/dto/post.dto';
import { ScheduledPostQueryDto, SchedulePostDto } from './dto/schedule.dto';
import { SchedulerService } from './scheduler.service';

@ApiTags('Scheduling')
@ApiBearerAuth()
@ApiStandardErrors()
@Controller()
export class SchedulerController {
  constructor(private readonly scheduler: SchedulerService) {}

  @Post('posts/:id/schedule')
  @ApiOperation({ summary: 'Schedule or reschedule a post (also used by calendar drag & drop)' })
  @ApiEnvelope(PostResponseDto)
  @ResponseMessage('Post scheduled')
  schedule(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SchedulePostDto) {
    return this.scheduler.schedule(user.id, id, dto);
  }

  @Delete('posts/:id/schedule')
  @ApiOperation({ summary: 'Cancel a schedule (post returns to draft)' })
  @ApiEnvelope(PostResponseDto)
  @ResponseMessage('Schedule cancelled')
  unschedule(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.scheduler.unschedule(user.id, id);
  }

  @Get('scheduled-posts')
  @ApiOperation({ summary: 'Upcoming scheduled posts (paginated)' })
  list(@CurrentUser() user: AuthUser, @Query() query: ScheduledPostQueryDto) {
    return this.scheduler.list(user.id, query);
  }
}
