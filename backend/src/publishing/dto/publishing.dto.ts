import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PostPlatformStatus, PublishingJobStatus, SocialPlatform } from '../../common/enums';

export class PublishNowDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Post-platform ids or social account ids to publish to. Omit to publish to every pending/failed platform of the post.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  targets?: string[];
}

export class PublishingJobQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() postId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() brandId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() batchId?: string;
  @ApiPropertyOptional({ enum: PublishingJobStatus }) @IsOptional() @IsEnum(PublishingJobStatus) status?: PublishingJobStatus;
  @ApiPropertyOptional({ enum: SocialPlatform }) @IsOptional() @IsEnum(SocialPlatform) platform?: SocialPlatform;
}

export class PublishJobSummaryDto {
  @ApiProperty() jobId: string;
  @ApiProperty() postPlatformId: string;
  @ApiProperty({ enum: SocialPlatform }) platform: SocialPlatform;
  @ApiProperty() accountName: string;
  @ApiProperty({ enum: PublishingJobStatus }) status: PublishingJobStatus;
}

export class PublishBatchResponseDto {
  @ApiProperty() batchId: string;
  @ApiProperty() postId: string;
  @ApiProperty({ type: [PublishJobSummaryDto] }) jobs: PublishJobSummaryDto[];
  @ApiProperty({ description: 'Platforms skipped before queueing (e.g. disconnected account, invalid content)' })
  skipped: { postPlatformId: string; platform: SocialPlatform; reason: string; errorCode: string }[];
}

export class PlatformStatusDto {
  @ApiProperty() postPlatformId: string;
  @ApiProperty({ enum: SocialPlatform }) platform: SocialPlatform;
  @ApiProperty() accountName: string;
  @ApiProperty({ enum: PostPlatformStatus }) status: PostPlatformStatus;
  @ApiPropertyOptional({ nullable: true }) platformPostUrl: string | null;
  @ApiPropertyOptional({ nullable: true }) errorCode: string | null;
  @ApiPropertyOptional({ nullable: true }) errorMessage: string | null;
  @ApiPropertyOptional({ nullable: true }) latestJobId: string | null;
  @ApiProperty() attempts: number;
  @ApiPropertyOptional({ nullable: true }) publishedAt: Date | null;
}
