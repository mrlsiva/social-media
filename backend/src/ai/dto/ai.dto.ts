import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AiGenerationStatus, AiGenerationType, ContentType, SocialPlatform } from '../../common/enums';
import { Sanitize } from '../../common/utils/sanitize';

const PUBLISHABLE = [SocialPlatform.INSTAGRAM, SocialPlatform.FACEBOOK, SocialPlatform.LINKEDIN, SocialPlatform.YOUTUBE];

/** Shared brief used by every text generator. Brand defaults fill missing values. */
export class AiBriefDto {
  @ApiProperty() @IsUUID() brandId: string;

  @ApiPropertyOptional({ enum: ContentType }) @IsOptional() @IsEnum(ContentType) contentType?: ContentType;

  @ApiPropertyOptional({ example: 'GST-ready billing software launch' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(500)
  topic?: string;

  @ApiPropertyOptional({ example: 'Sling Billings Pro' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(300)
  productService?: string;

  @ApiPropertyOptional({ example: 'Retail shop owners in Tamil Nadu' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(300)
  targetAudience?: string;

  @ApiPropertyOptional({ example: 'en', description: 'ISO language code or name, e.g. "ta", "hi", "Tamil"' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(30)
  language?: string;

  @ApiPropertyOptional({ example: 'friendly' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(50)
  tone?: string;

  @ApiPropertyOptional({ example: 'Drive demo bookings' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(300)
  objective?: string;

  @ApiPropertyOptional({ example: '30% off annual plans until Diwali' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(300)
  offer?: string;

  @ApiPropertyOptional()
  @IsOptional() @Sanitize() @IsString() @MaxLength(1500)
  additionalInstructions?: string;
}

export class GenerateCaptionDto extends AiBriefDto {
  @ApiPropertyOptional({ enum: PUBLISHABLE, description: 'Optimise for one platform' })
  @IsOptional() @IsIn(PUBLISHABLE)
  platform?: SocialPlatform;

  @ApiPropertyOptional({ default: 3, minimum: 1, maximum: 5 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5)
  variants?: number;
}

export class GenerateHashtagsDto extends AiBriefDto {
  @ApiPropertyOptional({ enum: PUBLISHABLE }) @IsOptional() @IsIn(PUBLISHABLE) platform?: SocialPlatform;

  @ApiPropertyOptional({ default: 20, minimum: 3, maximum: 30 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(3) @Max(30)
  count?: number;

  @ApiPropertyOptional({ description: 'Existing caption to derive hashtags from' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(5000)
  caption?: string;
}

export class GenerateIdeasDto extends AiBriefDto {
  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 10 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10)
  count?: number;
}

export class GenerateReelScriptDto extends AiBriefDto {
  @ApiPropertyOptional({ default: 30, minimum: 5, maximum: 180 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(180)
  durationSeconds?: number;
}

export class GeneratePlatformContentDto extends AiBriefDto {
  @ApiProperty({ enum: PUBLISHABLE, isArray: true })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(4) @IsIn(PUBLISHABLE, { each: true })
  platforms: SocialPlatform[];

  @ApiPropertyOptional({ description: 'Base caption to adapt (optional)' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(5000)
  baseCaption?: string;
}

export class GenerateImageDto {
  @ApiProperty() @IsUUID() brandId: string;

  @ApiProperty({ example: 'Diwali offer on billing software' })
  @Sanitize() @IsString() @MaxLength(500)
  topic: string;

  @ApiPropertyOptional({ example: 'A shop counter with a tablet showing invoices, festive lights' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '30% OFF' }) @IsOptional() @Sanitize() @IsString() @MaxLength(200) offer?: string;

  @ApiPropertyOptional({ example: 'flat illustration', description: 'photo-realistic, 3D render, minimal, flat illustration...' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(100)
  style?: string;

  @ApiPropertyOptional({ enum: ['square', 'portrait', 'landscape'], default: 'square' })
  @IsOptional() @IsIn(['square', 'portrait', 'landscape'])
  size?: 'square' | 'portrait' | 'landscape';

  @ApiPropertyOptional({ example: 'en', description: 'Language of any text rendered in the image' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(30)
  language?: string;

  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() useLogo?: boolean;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() useBrandColors?: boolean;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() includeBrandName?: boolean;
  @ApiPropertyOptional({ example: 'Book a demo' }) @IsOptional() @Sanitize() @IsString() @MaxLength(100) cta?: string;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() includeWebsite?: boolean;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 4 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(4)
  count?: number;
}

export class GenerateVideoDto {
  @ApiProperty() @IsUUID() brandId: string;

  @ApiProperty({ example: 'How Sling Billings speeds up checkout' })
  @Sanitize() @IsString() @MaxLength(500)
  topic: string;

  @ApiPropertyOptional() @IsOptional() @Sanitize() @IsString() @MaxLength(300) productService?: string;

  @ApiPropertyOptional({ default: 8, description: 'Seconds; snapped to what the provider supports (e.g. 4/8/12)' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(4) @Max(60)
  durationSeconds?: number;

  @ApiPropertyOptional({ example: 'cinematic, warm festive lighting' }) @IsOptional() @Sanitize() @IsString() @MaxLength(200) style?: string;
  @ApiPropertyOptional({ example: 'en' }) @IsOptional() @Sanitize() @IsString() @MaxLength(30) language?: string;
  @ApiPropertyOptional({ example: 'confident female narrator' }) @IsOptional() @Sanitize() @IsString() @MaxLength(100) voice?: string;
  @ApiPropertyOptional({ example: 'upbeat, festive' }) @IsOptional() @Sanitize() @IsString() @MaxLength(100) musicPreference?: string;

  @ApiPropertyOptional({ enum: ['portrait', 'landscape'], default: 'portrait' })
  @IsOptional() @IsIn(['portrait', 'landscape'])
  aspect?: 'portrait' | 'landscape';

  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() subtitles?: boolean;
  @ApiPropertyOptional() @IsOptional() @Sanitize() @IsString() @MaxLength(100) cta?: string;
}

export class SaveGenerationDto {
  @ApiPropertyOptional({ description: 'Index of the generated image to save (default: all)' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(9)
  index?: number;

  @ApiPropertyOptional() @IsOptional() @IsUUID() folderId?: string;

  @ApiPropertyOptional() @IsOptional() @Sanitize() @IsString() @MaxLength(255) name?: string;
}

export class AiGenerationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() brandId?: string;
  @ApiPropertyOptional({ enum: AiGenerationType }) @IsOptional() @IsEnum(AiGenerationType) type?: AiGenerationType;
  @ApiPropertyOptional({ enum: AiGenerationStatus }) @IsOptional() @IsEnum(AiGenerationStatus) status?: AiGenerationStatus;
}

export class CampaignPlanBriefDto extends AiBriefDto {
  @ApiPropertyOptional({ example: '10:00', description: 'Suggested daily posting time (HH:mm, brand timezone)' })
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  postingTime?: string;
}
