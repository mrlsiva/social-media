import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/auth.decorators';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { ApiEnvelope, ApiPaginatedEnvelope, ApiStandardErrors } from '../common/swagger/api-responses';
import { BrandsService } from './brands.service';
import {
  AddBrandMemberDto,
  BrandQueryDto,
  BrandResponseDto,
  BrandSettingsDto,
  CreateBrandDto,
  UpdateBrandDto,
  UpdateBrandMemberDto,
} from './dto/brand.dto';

@ApiTags('Brands')
@ApiBearerAuth()
@ApiStandardErrors()
@Controller('brands')
export class BrandsController {
  constructor(private readonly brands: BrandsService) {}

  @Get()
  @ApiOperation({ summary: 'List brands the user belongs to' })
  @ApiPaginatedEnvelope(BrandResponseDto)
  list(@CurrentUser() user: AuthUser, @Query() query: BrandQueryDto) {
    return this.brands.list(user.id, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a brand (limited by plan)' })
  @ApiEnvelope(BrandResponseDto)
  @ResponseMessage('Brand created')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBrandDto) {
    return this.brands.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a brand with its settings' })
  @ApiEnvelope(BrandResponseDto)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.brands.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update brand details/settings (brand admin)' })
  @ApiEnvelope(BrandResponseDto)
  @ResponseMessage('Brand updated')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBrandDto) {
    return this.brands.update(user.id, id, dto);
  }

  @Put(':id/settings')
  @ApiOperation({ summary: 'Update brand defaults & AI settings (brand admin)' })
  @ApiEnvelope(BrandResponseDto)
  @ResponseMessage('Brand settings updated')
  updateSettings(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BrandSettingsDto) {
    return this.brands.updateSettings(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a brand (owner only, soft delete)' })
  @ApiEnvelope()
  @ResponseMessage('Brand deleted')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.brands.remove(user.id, id);
    return null;
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'List brand team members' })
  members(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.brands.listMembers(user.id, id);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add an existing user to the brand team (limited by plan)' })
  @ResponseMessage('Member added')
  addMember(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddBrandMemberDto) {
    return this.brands.addMember(user.id, id, dto);
  }

  @Patch(':id/members/:memberId')
  @ApiOperation({ summary: 'Change a member role' })
  @ResponseMessage('Member updated')
  updateMember(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateBrandMemberDto,
  ) {
    return this.brands.updateMember(user.id, id, memberId, dto);
  }

  @Delete(':id/members/:memberId')
  @ApiOperation({ summary: 'Remove a member from the brand' })
  @ResponseMessage('Member removed')
  async removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    await this.brands.removeMember(user.id, id, memberId);
    return null;
  }
}
