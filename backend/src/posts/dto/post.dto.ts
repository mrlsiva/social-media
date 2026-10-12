import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ContentType, PostPlatformStatus, PostStatus, SocialPlatform } from '../../common/enums';
import { Sanitize } from '../../common/utils/sanitize';

const normalizeTags = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? [...new Set(value.filter((v): v is string => typeof v === 'string').map((v) => v.trim().replace(/^#+/, '')).filter(Boolean))]
    : value;

export class PostPlatformOptionsDto {
  @ApiPropertyOptional({ enum: ['public', 'unlisted', 'private'], description: 'YouTube privacy' })
  @IsOptional() @IsIn(['public', 'unlisted', 'private'])
  privacyStatus?: 'public' | 'unlisted' | 'private';

  @ApiPropertyOptional({ example: '22', description: 'YouTube category id' })
  @IsOptional() @Matches(/^\d{1,3}$/)
  categoryId?: string;

  @ApiPropertyOptional({ description: 'YouTube: self-declared made for kids' })
  @IsOptional() @IsBoolean()
  madeForKids?: boolean;

  @ApiPropertyOptional({ description: 'Instagram reels: also share to main feed' })
  @IsOptional() @IsBoolean()
  shareToFeed?: boolean;

  @ApiPropertyOptional({ enum: ['PUBLIC', 'CONNECTIONS'], description: 'LinkedIn visibility' })
  @IsOptional() @IsIn(['PUBLIC', 'CONNECTIONS'])
  visibility?: 'PUBLIC' | 'CONNECTIONS';
}

export class PostPlatformInputDto {
  @ApiProperty({ description: 'Connected social account id (must belong to the same brand)' })
  @IsUUID()
  socialAccountId: string;

  @ApiPropertyOptional({ description: 'Platform-specific caption. Falls back to the main caption.' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(10000)
  captionOverride?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(60) @Transform(normalizeTags) @IsString({ each: true })
  hashtagsOverride?: string[];

  @ApiPropertyOptional({ description: 'Platform-specific title (YouTube)' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(100)
  titleOverride?: string;

  @ApiPropertyOptional({ type: PostPlatformOptionsDto })
  @IsOptional() @ValidateNested() @Type(() => PostPlatformOptionsDto)
  options?: PostPlatformOptionsDto;
}

export class ReelScriptDto {
  @ApiProperty() @Sanitize() @IsString() @MaxLength(1000) hook: string;
  @ApiProperty() @Sanitize() @IsString() @MaxLength(5000) mainContent: string;
  @ApiProperty() @Sanitize() @IsString() @MaxLength(1000) cta: string;
  @ApiProperty() @Sanitize() @IsString() @MaxLength(1000) ending: string;
}

export class TextOverlayDto {
  @ApiProperty() @Sanitize() @IsString() @MaxLength(200) text: string;
  @ApiProperty() @IsNumber() @Min(0) startSeconds: number;
  @ApiProperty() @IsNumber() @Min(0) endSeconds: number;
  @ApiPropertyOptional({ enum: ['top', 'center', 'bottom'] }) @IsOptional() @IsIn(['top', 'center', 'bottom']) position?: 'top' | 'center' | 'bottom';
}

export class ReelInputDto {
  @ApiPropertyOptional({ type: ReelScriptDto })
  @IsOptional() @ValidateNested() @Type(() => ReelScriptDto)
  script?: ReelScriptDto;

  @ApiPropertyOptional({ type: [TextOverlayDto] })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => TextOverlayDto)
  textOverlays?: TextOverlayDto[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean() voiceOverEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @Sanitize() @IsString() @MaxLength(5000) voiceOverText?: string;
  @ApiPropertyOptional({ example: 'female-warm' }) @IsOptional() @IsString() @MaxLength(50) voice?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() subtitlesEnabled?: boolean;
  @ApiPropertyOptional({ description: 'SRT subtitles' }) @IsOptional() @IsString() @MaxLength(20000) subtitlesSrt?: string;
  @ApiPropertyOptional({ example: 'upbeat electronic' }) @IsOptional() @Sanitize() @IsString() @MaxLength(100) musicPreference?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(600) durationSeconds?: number;
}

export class CreatePostDto {
  @ApiProperty() @IsUUID() brandId: string;

  @ApiProperty({ enum: ContentType }) @IsEnum(ContentType) contentType: ContentType;

  @ApiPropertyOptional({ description: 'Internal title' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional() @Sanitize() @IsString() @MaxLength(10000)
  caption?: string;

  @ApiPropertyOptional({ type: [String], example: ['diwali', 'billing'] })
  @IsOptional() @IsArray() @ArrayMaxSize(60) @Transform(normalizeTags) @IsString({ each: true })
  hashtags?: string[];

  @ApiPropertyOptional({ type: [String], example: ['slinggroups'] })
  @IsOptional() @IsArray() @ArrayMaxSize(20) @Transform(normalizeTags) @IsString({ each: true })
  mentions?: string[];

  @ApiPropertyOptional({ example: 'Book a free demo' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(255)
  cta?: string;

  @ApiPropertyOptional({ example: 'https://slinggroups.com/offer' })
  @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(1000)
  linkUrl?: string;

  @ApiPropertyOptional({ description: 'Video title (YouTube)' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(100)
  videoTitle?: string;

  @ApiPropertyOptional({ description: 'Video description (YouTube)' })
  @IsOptional() @Sanitize() @IsString() @MaxLength(5000)
  videoDescription?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() thumbnailMediaId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Ordered media ids from the brand library' })
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsUUID('all', { each: true })
  mediaIds?: string[];

  @ApiPropertyOptional({ type: [PostPlatformInputDto] })
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => PostPlatformInputDto)
  platforms?: PostPlatformInputDto[];

  @ApiPropertyOptional({ type: ReelInputDto, description: 'Required data for content type "reel"' })
  @IsOptional() @ValidateNested() @Type(() => ReelInputDto)
  reel?: ReelInputDto;

  @ApiPropertyOptional() @IsOptional() @IsUUID() campaignId?: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' }) @IsOptional() @IsTimeZone() timezone?: string;
}

export class UpdatePostDto extends PartialType(OmitType(CreatePostDto, ['brandId'] as const)) {}

export class PostQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() brandId?: string;
  @ApiPropertyOptional({ enum: PostStatus }) @IsOptional() @IsEnum(PostStatus) status?: PostStatus;
  @ApiPropertyOptional({ enum: ContentType }) @IsOptional() @IsEnum(ContentType) contentType?: ContentType;
  @ApiPropertyOptional() @IsOptional() @IsUUID() campaignId?: string;
  @ApiPropertyOptional({ enum: SocialPlatform }) @IsOptional() @IsEnum(SocialPlatform) platform?: SocialPlatform;
  @ApiPropertyOptional({ description: 'ISO date - filter by scheduled/published/created date' }) @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() to?: string;
}

export class CalendarQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() brandId?: string;
  @ApiProperty({ example: '2026-10-01T00:00:00Z' }) @IsISO8601() from: string;
  @ApiProperty({ example: '2026-10-31T23:59:59Z' }) @IsISO8601() to: string;
}

export class PostMediaResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() url: string;
  @ApiProperty() type: string;
  @ApiProperty() mimeType: string;
  @ApiPropertyOptional({ nullable: true }) width: number | null;
  @ApiPropertyOptional({ nullable: true }) height: number | null;
  @ApiProperty() position: number;
}

export class PostPlatformResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() socialAccountId: string;
  @ApiProperty({ enum: SocialPlatform }) platform: SocialPlatform;
  @ApiPropertyOptional({ nullable: true }) accountName: string | null;
  @ApiPropertyOptional({ nullable: true }) profileImageUrl: string | null;
  @ApiProperty({ enum: PostPlatformStatus }) status: PostPlatformStatus;
  @ApiPropertyOptional({ nullable: true }) captionOverride: string | null;
  @ApiPropertyOptional({ type: [String], nullable: true }) hashtagsOverride: string[] | null;
  @ApiPropertyOptional({ nullable: true }) titleOverride: string | null;
  @ApiPropertyOptional({ type: PostPlatformOptionsDto, nullable: true }) options: PostPlatformOptionsDto | null;
  @ApiPropertyOptional({ nullable: true }) platformPostId: string | null;
  @ApiPropertyOptional({ nullable: true }) platformPostUrl: string | null;
  @ApiPropertyOptional({ nullable: true }) errorCode: string | null;
  @ApiPropertyOptional({ nullable: true }) errorMessage: string | null;
  @ApiProperty() attempts: number;
  @ApiPropertyOptional({ nullable: true }) publishedAt: Date | null;
}

export class PostResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() brandId: string;
  @ApiPropertyOptional({ nullable: true }) campaignId: string | null;
  @ApiPropertyOptional({ nullable: true }) title: string | null;
  @ApiProperty({ enum: ContentType }) contentType: ContentType;
  @ApiPropertyOptional({ nullable: true }) caption: string | null;
  @ApiProperty({ type: [String] }) hashtags: string[];
  @ApiProperty({ type: [String] }) mentions: string[];
  @ApiPropertyOptional({ nullable: true }) cta: string | null;
  @ApiPropertyOptional({ nullable: true }) linkUrl: string | null;
  @ApiPropertyOptional({ nullable: true }) videoTitle: string | null;
  @ApiPropertyOptional({ nullable: true }) videoDescription: string | null;
  @ApiPropertyOptional({ type: PostMediaResponseDto, nullable: true }) thumbnail: PostMediaResponseDto | null;
  @ApiProperty({ enum: PostStatus }) status: PostStatus;
  @ApiPropertyOptional({ nullable: true }) scheduledAt: Date | null;
  @ApiPropertyOptional({ nullable: true }) publishedAt: Date | null;
  @ApiProperty() timezone: string;
  @ApiProperty({ type: [PostMediaResponseDto] }) media: PostMediaResponseDto[];
  @ApiProperty({ type: [PostPlatformResponseDto] }) platforms: PostPlatformResponseDto[];
  @ApiPropertyOptional({ type: ReelInputDto, nullable: true }) reel: Record<string, unknown> | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class HashtagQueryDto extends PaginationQueryDto {}

