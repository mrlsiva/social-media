import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsTimeZone, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ScheduledPostStatus } from '../../common/enums';

export class SchedulePostDto {
  @ApiProperty({ example: '2026-10-10T04:30:00.000Z', description: 'ISO 8601 instant (UTC or with offset)' })
  @IsISO8601({ strict: true })
  scheduledAt: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata', description: 'Timezone the user picked (for display)' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}

export class ScheduledPostQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() brandId?: string;
  @ApiPropertyOptional({ enum: ScheduledPostStatus }) @IsOptional() @IsEnum(ScheduledPostStatus) status?: ScheduledPostStatus;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() to?: string;
}
