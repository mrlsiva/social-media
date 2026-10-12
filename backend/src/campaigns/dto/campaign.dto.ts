import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CampaignStatus, SocialPlatform } from '../../common/enums';
import { Sanitize } from '../../common/utils/sanitize';

const PUBLISHABLE = [SocialPlatform.INSTAGRAM, SocialPlatform.FACEBOOK, SocialPlatform.LINKEDIN, SocialPlatform.YOUTUBE];

export class CreateCampaignDto {
  @ApiProperty() @IsUUID() brandId: string;

  @ApiProperty({ example: 'Diwali 2026' }) @Sanitize() @IsString() @Length(1, 191) name: string;

  @ApiPropertyOptional() @IsOptional() @Sanitize() @IsString() @MaxLength(5000) description?: string;

  @ApiPropertyOptional({ example: 'Increase festive season sign-ups' }) @IsOptional() @Sanitize() @IsString() @MaxLength(255) objective?: string;

  @ApiProperty({ example: '2026-10-14' }) @IsDateString({ strict: true }) startDate: string;

  @ApiProperty({ example: 7, minimum: 1, maximum: 90 }) @Type(() => Number) @IsInt() @Min(1) @Max(90) durationDays: number;

  @ApiProperty({ enum: PUBLISHABLE, isArray: true })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(8) @IsIn(PUBLISHABLE, { each: true })
  platforms: SocialPlatform[];
}

export class UpdateCampaignDto extends PartialType(OmitType(CreateCampaignDto, ['brandId'] as const)) {
  @ApiPropertyOptional({ enum: CampaignStatus }) @IsOptional() @IsEnum(CampaignStatus) status?: CampaignStatus;
}

export class CampaignQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() brandId?: string;
  @ApiPropertyOptional({ enum: CampaignStatus }) @IsOptional() @IsEnum(CampaignStatus) status?: CampaignStatus;
}
