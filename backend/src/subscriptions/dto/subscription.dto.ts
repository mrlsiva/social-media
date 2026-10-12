import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { LimitPeriod, UsageMetric } from '../../common/enums';

export class PlanLimitDto {
  @ApiProperty({ enum: UsageMetric })
  @IsEnum(UsageMetric)
  metric: UsageMetric;

  @ApiProperty({ description: '-1 = unlimited', example: 100 })
  @IsInt()
  @Min(-1)
  limitValue: number;

  @ApiProperty({ enum: LimitPeriod })
  @IsEnum(LimitPeriod)
  period: LimitPeriod;
}

export class UpsertPlanDto {
  @ApiProperty({ example: 'starter' })
  @Matches(/^[a-z0-9_-]{2,50}$/)
  code: string;

  @ApiProperty({ example: 'Starter' })
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 19 })
  @IsNumber()
  @Min(0)
  priceMonthly: number;

  @ApiProperty({ example: 190 })
  @IsNumber()
  @Min(0)
  priceYearly: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({ type: [PlanLimitDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PlanLimitDto)
  limits?: PlanLimitDto[];
}

export class AssignPlanDto {
  @ApiProperty() @IsUUID() userId: string;
  @ApiProperty({ example: 'business' }) @IsString() planCode: string;
  @ApiPropertyOptional({ enum: ['monthly', 'yearly'] }) @IsOptional() @IsIn(['monthly', 'yearly']) billingCycle?: 'monthly' | 'yearly';
  @ApiPropertyOptional() @IsOptional() @IsISO8601() currentPeriodEnd?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() externalProvider?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() externalId?: string;
}
