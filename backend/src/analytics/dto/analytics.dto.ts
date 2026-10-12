import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { SocialPlatform } from '../../common/enums';

export class AnalyticsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() brandId?: string;
  @ApiPropertyOptional({ enum: SocialPlatform }) @IsOptional() @IsEnum(SocialPlatform) platform?: SocialPlatform;
  @ApiPropertyOptional({ example: '2026-09-01', description: 'Defaults to 30 days ago' }) @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional({ example: '2026-10-07', description: 'Defaults to today' }) @IsOptional() @IsISO8601() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() campaignId?: string;
}

export class DashboardQueryDto {
  @ApiPropertyOptional({ description: 'Limit the dashboard to one brand' }) @IsOptional() @IsUUID() brandId?: string;
}
