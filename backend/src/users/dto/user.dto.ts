import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsTimeZone, Length, Matches, MaxLength } from 'class-validator';
import { Sanitize } from '../../common/utils/sanitize';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Priya' })
  @IsOptional()
  @Sanitize()
  @IsString()
  @Length(1, 100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Sharma' })
  @IsOptional()
  @Sanitize()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ example: '+91 98765 43210' })
  @IsOptional()
  @Matches(/^[+\d\s()-]{5,30}$/)
  phone?: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}

export class UserResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() firstName: string;
  @ApiPropertyOptional({ nullable: true }) lastName: string | null;
  @ApiPropertyOptional({ nullable: true }) avatarUrl: string | null;
  @ApiPropertyOptional({ nullable: true }) phone: string | null;
  @ApiProperty() timezone: string;
  @ApiProperty({ type: [String] }) roles: string[];
  @ApiProperty() createdAt: Date;
}
