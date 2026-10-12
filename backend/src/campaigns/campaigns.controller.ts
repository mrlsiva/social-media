import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CampaignPlanBriefDto } from '../ai/dto/ai.dto';
import { AuthUser, CurrentUser } from '../common/decorators/auth.decorators';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { ApiStandardErrors } from '../common/swagger/api-responses';
import { CampaignsService } from './campaigns.service';
import { CampaignQueryDto, CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';

@ApiTags('Campaigns')
@ApiBearerAuth()
@ApiStandardErrors()
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @ApiOperation({ summary: 'List campaigns' })
  list(@CurrentUser() user: AuthUser, @Query() query: CampaignQueryDto) {
    return this.campaigns.list(user.id, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a campaign (e.g. "Diwali 2026", 7 days)' })
  @ResponseMessage('Campaign created')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCampaignDto) {
    return this.campaigns.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Campaign with its day-by-day posts' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a campaign' })
  @ResponseMessage('Campaign updated')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaigns.update(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a campaign (posts are kept)' })
  @ResponseMessage('Campaign deleted')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.campaigns.remove(user.id, id);
    return null;
  }

  @Post(':id/generate')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'AI-generate the day-by-day plan as editable draft posts (review before publishing)' })
  @ResponseMessage('Campaign plan generated')
  generate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CampaignPlanBriefDto) {
    return this.campaigns.generate(user.id, id, dto);
  }

  @Post(':id/schedule-all')
  @ApiOperation({ summary: 'Schedule every draft post of the campaign at its planned date/time' })
  @ResponseMessage('Campaign scheduled')
  scheduleAll(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.scheduleAll(user.id, id);
  }
}
