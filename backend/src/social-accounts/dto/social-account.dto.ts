import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { SocialAccountStatus, SocialPlatform } from '../../common/enums';

export class SocialAccountQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() brandId?: string;
  @ApiPropertyOptional({ enum: SocialPlatform }) @IsOptional() @IsEnum(SocialPlatform) platform?: SocialPlatform;
  @ApiPropertyOptional({ enum: SocialAccountStatus }) @IsOptional() @IsEnum(SocialAccountStatus) status?: SocialAccountStatus;
}

export class ConnectSocialAccountDto {
  @ApiProperty({ description: 'Brand that the connected account(s) will belong to' })
  @IsUUID()
  brandId: string;

  @ApiPropertyOptional({
    description:
      'Where the browser returns after OAuth. Must match WEB_APP_URL or OAUTH_ALLOWED_RETURN_URLS (e.g. a mobile deep link like socialpilot://oauth).',
    example: 'http://localhost:4200/social-accounts/callback',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  returnUrl?: string;
}

export class CompleteConnectionDto {
  @ApiProperty({ type: [String], description: 'Discovered account keys to connect (from GET /social-accounts/oauth-sessions/:id)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  accountKeys: string[];
}

export class SocialAccountResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() brandId: string;
  @ApiProperty({ enum: SocialPlatform }) platform: SocialPlatform;
  @ApiProperty() platformAccountId: string;
  @ApiProperty() accountName: string;
  @ApiProperty() accountType: string;
  @ApiPropertyOptional({ nullable: true }) username: string | null;
  @ApiPropertyOptional({ nullable: true }) profileImageUrl: string | null;
  @ApiProperty({ enum: SocialAccountStatus }) status: SocialAccountStatus;
  @ApiPropertyOptional({ nullable: true }) statusMessage: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Access token expiry (the token itself is never returned)' }) tokenExpiresAt: Date | null;
  @ApiPropertyOptional({ nullable: true }) lastSyncedAt: Date | null;
  @ApiProperty() createdAt: Date;
}

export class ConnectResponseDto {
  @ApiProperty({ description: 'Open this URL in the browser / in-app browser to start OAuth' }) authorizationUrl: string;
  @ApiProperty() expiresAt: Date;
}

export class CallbackQueryDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() error?: string;
  @IsOptional() @IsString() error_description?: string;
  @IsOptional() @IsString() error_reason?: string;
  // Extra parameters Meta (on cancel/failure) and Google append to the redirect.
  // Unused, but the global forbidNonWhitelisted pipe would otherwise reject the callback.
  @IsOptional() @IsString() error_code?: string;
  @IsOptional() @IsString() error_message?: string;
  @IsOptional() @IsString() iss?: string;
  @IsOptional() @IsString() scope?: string;
  @IsOptional() @IsString() authuser?: string;
  @IsOptional() @IsString() prompt?: string;
  @IsOptional() @IsString() hd?: string;
}
