import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/auth.decorators';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { ApiEnvelope } from '../common/swagger/api-responses';
import { UpdateProfileDto, UserResponseDto } from './dto/user.dto';
import { UsersService } from './users.service';
import { toUserResponse } from './users.mapper';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @ApiEnvelope(UserResponseDto)
  async me(@CurrentUser() user: AuthUser): Promise<UserResponseDto> {
    return toUserResponse(await this.users.findById(user.id));
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the authenticated user profile' })
  @ApiEnvelope(UserResponseDto)
  @ResponseMessage('Profile updated')
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto): Promise<UserResponseDto> {
    return toUserResponse(await this.users.updateProfile(user.id, dto));
  }
}
