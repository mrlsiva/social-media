import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsHexColor,
  IsIn,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { BrandRole } from '../../common/enums';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Sanitize } from '../../common/utils/sanitize';

export class BrandAiSettingsDto {
  @ApiPropertyOptional({ example: 'Friendly, expert and optimistic. Speaks to small business owners.' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(1000)
  brandVoice?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(30) @Sanitize() @IsString({ each: true })
  keywords?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(30) @Sanitize() @IsString({ each: true })
  avoidWords?: string[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  useBrandingInImages?: boolean;

  @ApiPropertyOptional({ enum: ['none', 'light', 'heavy'] })
  @IsOptional() @IsIn(['none', 'light', 'heavy'])
  emojiLevel?: 'none' | 'light' | 'heavy';
}

export class BrandSettingsDto {
  @ApiPropertyOptional({ example: 'en' })
  @IsOptional() @Matches(/^[a-z]{2}(-[A-Z]{2})?$/)
  defaultLanguage?: string;

  @ApiPropertyOptional({ example: 'professional' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(50)
  defaultTone?: string;

  @ApiPropertyOptional({ example: 'Book a free demo today' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(255)
  defaultCta?: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptional() @IsTimeZone()
  timezone?: string;

  @ApiPropertyOptional({ type: [String], example: ['billing', 'smallbusiness'] })
  @IsOptional() @IsArray() @ArrayMaxSize(30) @Sanitize() @IsString({ each: true })
  defaultHashtags?: string[];

  @ApiPropertyOptional({ type: BrandAiSettingsDto })
  @IsOptional() @ValidateNested() @Type(() => BrandAiSettingsDto)
  aiSettings?: BrandAiSettingsDto;
}

export class CreateBrandDto {
  @ApiProperty({ example: 'Sling Groups' })
  @Sanitize() @IsString() @Length(1, 150)
  name: string;

  @ApiPropertyOptional({ example: 'Business solutions for growing companies' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ example: 'https://slinggroups.com' })
  @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(255)
  website?: string;

  @ApiPropertyOptional({ example: '+91 98765 43210' })
  @IsOptional() @Matches(/^[+\d\s()-]{5,30}$/)
  phone?: string;

  @ApiPropertyOptional({ example: 'hello@slinggroups.com' })
  @IsOptional() @IsEmail() @MaxLength(191)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional() @Sanitize() @IsString() @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ example: '#0078B8' })
  @IsOptional() @IsHexColor()
  primaryColor?: string;

  @ApiPropertyOptional({ example: '#F57AA8' })
  @IsOptional() @IsHexColor()
  secondaryColor?: string;

  @ApiPropertyOptional({ type: BrandSettingsDto })
  @IsOptional() @ValidateNested() @Type(() => BrandSettingsDto)
  settings?: BrandSettingsDto;
}

export class UpdateBrandDto extends PartialType(CreateBrandDto) {}

export class BrandQueryDto extends PaginationQueryDto {}

export class AddBrandMemberDto {
  @ApiProperty({ example: 'designer@slinggroups.com', description: 'Email of an existing user account' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: [BrandRole.ADMIN, BrandRole.EDITOR, BrandRole.VIEWER] })
  @IsIn([BrandRole.ADMIN, BrandRole.EDITOR, BrandRole.VIEWER])
  role: BrandRole;
}

export class UpdateBrandMemberDto {
  @ApiProperty({ enum: [BrandRole.ADMIN, BrandRole.EDITOR, BrandRole.VIEWER] })
  @IsEnum(BrandRole)
  @IsIn([BrandRole.ADMIN, BrandRole.EDITOR, BrandRole.VIEWER])
  role: BrandRole;
}

export class BrandResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiPropertyOptional({ nullable: true }) logoUrl: string | null;
  @ApiPropertyOptional({ nullable: true }) description: string | null;
  @ApiPropertyOptional({ nullable: true }) website: string | null;
  @ApiPropertyOptional({ nullable: true }) phone: string | null;
  @ApiPropertyOptional({ nullable: true }) email: string | null;
  @ApiPropertyOptional({ nullable: true }) address: string | null;
  @ApiProperty() primaryColor: string;
  @ApiProperty() secondaryColor: string;
  @ApiProperty({ enum: BrandRole }) role: BrandRole;
  @ApiPropertyOptional({ type: BrandSettingsDto }) settings?: BrandSettingsDto;
  @ApiProperty() createdAt: Date;
}
