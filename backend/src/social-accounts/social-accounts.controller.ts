import { Body, Controller, Delete, Get, Param, ParseEnumPipe, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthUser, CurrentUser, Public } from '../common/decorators/auth.decorators';
import { RawResponse, ResponseMessage } from '../common/decorators/response-message.decorator';
import { SocialPlatform } from '../common/enums';
import { ApiEnvelope, ApiPaginatedEnvelope, ApiStandardErrors } from '../common/swagger/api-responses';
import {
  CallbackQueryDto,
  CompleteConnectionDto,
  ConnectResponseDto,
  ConnectSocialAccountDto,
  SocialAccountQueryDto,
  SocialAccountResponseDto,
} from './dto/social-account.dto';
import { SocialAccountsService } from './social-accounts.service';

@ApiTags('Social Accounts')
@ApiStandardErrors()
@Controller('social-accounts')
export class SocialAccountsController {
  constructor(private readonly service: SocialAccountsService) {}

  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'List connected social accounts (tokens are never returned)' })
  @ApiPaginatedEnvelope(SocialAccountResponseDto)
  list(@CurrentUser() user: AuthUser, @Query() query: SocialAccountQueryDto) {
    return this.service.list(user.id, query);
  }

  @ApiBearerAuth()
  @Get('platforms')
  @ApiOperation({ summary: 'Supported platforms, whether the server has OAuth credentials, and capabilities' })
  platforms() {
    return this.service.platforms();
  }

  @ApiBearerAuth()
  @Post(':platform/connect')
  @ApiOperation({
    summary: 'Start OAuth. Open `authorizationUrl` in a browser; the provider redirects to the callback, which redirects to returnUrl?session=...',
  })
  @ApiEnvelope(ConnectResponseDto)
  connect(
    @CurrentUser() user: AuthUser,
    @Param('platform', new ParseEnumPipe(SocialPlatform)) platform: SocialPlatform,
    @Body() dto: ConnectSocialAccountDto,
  ) {
    return this.service.connect(user.id, platform, dto);
  }

  /** OAuth redirect target registered with Meta / Google / LinkedIn. */
  @Public()
  @SkipThrottle()
  @RawResponse()
  @Get(':platform/callback')
  @ApiOperation({ summary: 'OAuth redirect URI (called by the provider, not by clients)' })
  async callback(@Query() query: CallbackQueryDto, @Res() res: Response) {
    const redirectUrl = await this.service.handleCallback(query);
    res.redirect(302, redirectUrl);
  }

  @ApiBearerAuth()
  @Get('oauth-sessions/:sessionId')
  @ApiOperation({ summary: 'Accounts discovered during OAuth (pages, channels, organizations) to choose from' })
  session(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.service.getSession(user.id, sessionId);
  }

  @ApiBearerAuth()
  @Post('oauth-sessions/:sessionId/complete')
  @ApiOperation({ summary: 'Connect the selected discovered accounts to the brand' })
  @ApiEnvelope(SocialAccountResponseDto, { isArray: true })
  @ResponseMessage('Social account(s) connected')
  complete(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sessionId: string, @Body() dto: CompleteConnectionDto) {
    return this.service.completeSession(user.id, sessionId, dto.accountKeys);
  }

  @ApiBearerAuth()
  @Post(':id/validate')
  @ApiOperation({ summary: 'Check the connection is still valid (updates status)' })
  @ApiEnvelope(SocialAccountResponseDto)
  validate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.validate(user.id, id);
  }

  @ApiBearerAuth()
  @Post(':id/refresh-token')
  @ApiOperation({ summary: 'Force a token refresh (where the platform supports it)' })
  @ApiEnvelope(SocialAccountResponseDto)
  @ResponseMessage('Token refreshed')
  refresh(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.refreshToken(user.id, id);
  }

  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({ summary: 'Disconnect an account (revokes and deletes stored tokens)' })
  @ApiEnvelope()
  @ResponseMessage('Social account disconnected')
  async disconnect(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.service.disconnect(user.id, id);
    return null;
  }

}
