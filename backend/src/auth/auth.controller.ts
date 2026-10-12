import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser, Public } from '../common/decorators/auth.decorators';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { ApiEnvelope, ApiErrorResponse } from '../common/swagger/api-responses';
import { ReqMeta, RequestMeta } from '../common/utils/request-meta';
import { UserResponseDto } from '../users/dto/user.dto';
import { UsersService } from '../users/users.service';
import { toUserResponse } from '../users/users.mapper';
import { AuthService } from './auth.service';
import {
  AuthResponseDto,
  ChangePasswordDto,
  LoginDto,
  PushTokenDto,
  RefreshTokenDto,
  RegisterDto,
  SessionResponseDto,
} from './dto/auth.dto';

const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @ApiOperation({ summary: 'Create an account (starts on the default plan) and log in' })
  @ApiEnvelope(AuthResponseDto)
  @ApiTooManyRequestsResponse({ type: ApiErrorResponse })
  @ResponseMessage('Account created')
  register(@Body() dto: RegisterDto, @ReqMeta() meta: RequestMeta) {
    return this.auth.register(dto, meta);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email + password. Returns access and refresh tokens.' })
  @ApiEnvelope(AuthResponseDto)
  @ApiTooManyRequestsResponse({ type: ApiErrorResponse })
  @ResponseMessage('Logged in')
  login(@Body() dto: LoginDto, @ReqMeta() meta: RequestMeta) {
    return this.auth.login(dto, meta);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair (rotation: old token becomes invalid)' })
  @ApiEnvelope(AuthResponseDto)
  @ResponseMessage('Token refreshed')
  refresh(@Body() dto: RefreshTokenDto, @ReqMeta() meta: RequestMeta) {
    return this.auth.refresh(dto.refreshToken, meta);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out the current device/session' })
  @ApiEnvelope()
  @ResponseMessage('Logged out')
  async logout(@CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta): Promise<null> {
    await this.auth.logout(user.id, user.sessionId, meta);
    return null;
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out every device, including this one' })
  @ApiEnvelope()
  @ResponseMessage('Logged out from all devices')
  async logoutAll(@CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    return { revokedSessions: await this.auth.logoutAll(user.id, meta) };
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Current user with system roles' })
  @ApiEnvelope(UserResponseDto)
  async me(@CurrentUser() user: AuthUser): Promise<UserResponseDto> {
    return toUserResponse(await this.users.findById(user.id));
  }

  @ApiBearerAuth()
  @Get('sessions')
  @ApiOperation({ summary: 'List active sessions (devices)' })
  @ApiEnvelope(SessionResponseDto, { isArray: true })
  sessions(@CurrentUser() user: AuthUser) {
    return this.auth.listSessions(user.id, user.sessionId);
  }

  @ApiBearerAuth()
  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Revoke a specific device session' })
  @ApiEnvelope()
  @ResponseMessage('Session revoked')
  async revokeSession(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    await this.auth.revokeSession(user.id, id, meta);
    return null;
  }

  @ApiBearerAuth()
  @Put('sessions/current/push-token')
  @ApiOperation({ summary: 'Register the FCM/APNs push token for this device (mobile apps)' })
  @ApiEnvelope()
  @ResponseMessage('Push token saved')
  async pushToken(@CurrentUser() user: AuthUser, @Body() dto: PushTokenDto) {
    await this.auth.setPushToken(user.id, user.sessionId, dto.pushToken);
    return null;
  }

  @ApiBearerAuth()
  @Throttle(AUTH_THROTTLE)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password (signs out all other devices)' })
  @ApiEnvelope()
  @ResponseMessage('Password changed')
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @ReqMeta() meta: RequestMeta) {
    await this.auth.changePassword(user.id, user.sessionId, dto, meta);
    return null;
  }
}
