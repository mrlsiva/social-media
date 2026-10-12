import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { AI_PROVIDER_IDS, AiProviderId } from './ai-settings.constants';

/** For every field: a value sets it, '' removes it (back to the .env default), omitted leaves it unchanged. */
export class ProviderSettingsDto {
  @ApiPropertyOptional({ description: 'API key. Never returned by the API; send "" to remove it.' })
  @IsOptional() @IsString() @MaxLength(1000)
  apiKey?: string;

  @ApiPropertyOptional({ example: 'https://openrouter.ai/api/v1', description: 'Custom provider only' })
  @IsOptional() @IsString() @MaxLength(500)
  baseUrl?: string;

  @ApiPropertyOptional({ example: 'gpt-4.1-mini' }) @IsOptional() @IsString() @MaxLength(191) textModel?: string;
  @ApiPropertyOptional({ example: 'gpt-image-1' }) @IsOptional() @IsString() @MaxLength(191) imageModel?: string;
  @ApiPropertyOptional({ example: 'sora-2' }) @IsOptional() @IsString() @MaxLength(191) videoModel?: string;
}

export class UpdateAiSettingsDto {
  @ApiPropertyOptional({ enum: AI_PROVIDER_IDS }) @IsOptional() @IsString() textProvider?: string;
  @ApiPropertyOptional({ enum: AI_PROVIDER_IDS }) @IsOptional() @IsString() imageProvider?: string;
  @ApiPropertyOptional({ enum: AI_PROVIDER_IDS }) @IsOptional() @IsString() videoProvider?: string;

  @ApiPropertyOptional({ type: ProviderSettingsDto }) @IsOptional() @ValidateNested() @Type(() => ProviderSettingsDto) openai?: ProviderSettingsDto;
  @ApiPropertyOptional({ type: ProviderSettingsDto }) @IsOptional() @ValidateNested() @Type(() => ProviderSettingsDto) nvidia?: ProviderSettingsDto;
  @ApiPropertyOptional({ type: ProviderSettingsDto }) @IsOptional() @ValidateNested() @Type(() => ProviderSettingsDto) custom?: ProviderSettingsDto;
}

export class TestAiProviderDto {
  @ApiPropertyOptional({ enum: AI_PROVIDER_IDS }) @IsIn(AI_PROVIDER_IDS) provider: AiProviderId;
}
