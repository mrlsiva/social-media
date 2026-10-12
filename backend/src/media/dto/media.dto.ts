import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { MediaSource, MediaType } from '../../common/enums';
import { Sanitize } from '../../common/utils/sanitize';

/** Multipart form fields arrive as strings; tags may be "a,b,c" or JSON array. */
const toStringArray = ({ value }: { value: unknown }) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  if (value.trim().startsWith('[')) {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }
  return value.split(',').map((t) => t.trim()).filter(Boolean);
};

export class MediaQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MediaType })
  @IsOptional()
  @IsEnum(MediaType)
  type?: MediaType;

  @ApiPropertyOptional({ enum: MediaSource })
  @IsOptional()
  @IsEnum(MediaSource)
  source?: MediaSource;

  @ApiPropertyOptional({ description: 'Folder id, or "root" for unfiled media' })
  @IsOptional()
  @ValidateIf((o: MediaQueryDto) => o.folderId !== 'root')
  @IsUUID()
  folderId?: string;
}

export class UploadMediaDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'JPG, JPEG, PNG, WEBP, MP4 or MOV' })
  file: unknown;

  @ApiPropertyOptional({ enum: [MediaType.LOGO, MediaType.THUMBNAIL], description: 'Override type for image uploads' })
  @IsOptional()
  @IsIn([MediaType.LOGO, MediaType.THUMBNAIL, MediaType.IMAGE, MediaType.VIDEO])
  type?: MediaType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  folderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Sanitize()
  @IsString()
  @Length(1, 255)
  name?: string;

  @ApiPropertyOptional({ type: [String], description: 'Comma separated or JSON array' })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(30)
  @Sanitize()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Sanitize()
  @IsString()
  @MaxLength(500)
  altText?: string;
}

export class BulkUploadMediaDto {
  @ApiProperty({ type: 'array', items: { type: 'string', format: 'binary' } })
  files: unknown[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  folderId?: string;
}

export class LogoUploadDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'JPG, PNG or WEBP' })
  file: unknown;
}

export class UpdateMediaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Sanitize()
  @IsString()
  @Length(1, 255)
  name?: string;

  @ApiPropertyOptional({ nullable: true, description: 'null moves the file to the root' })
  @IsOptional()
  @ValidateIf((o: UpdateMediaDto) => o.folderId !== null)
  @IsUUID()
  folderId?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @Sanitize()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Sanitize()
  @IsString()
  @MaxLength(500)
  altText?: string;
}

export class CreateFolderDto {
  @ApiProperty({ example: 'Diwali 2026' })
  @Sanitize()
  @IsString()
  @Length(1, 150)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class UpdateFolderDto {
  @ApiProperty()
  @Sanitize()
  @IsString()
  @Length(1, 150)
  name: string;
}

export class MediaResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() brandId: string;
  @ApiPropertyOptional({ nullable: true }) folderId: string | null;
  @ApiProperty({ enum: MediaType }) type: MediaType;
  @ApiProperty({ enum: MediaSource }) source: MediaSource;
  @ApiProperty() name: string;
  @ApiProperty() url: string;
  @ApiProperty() mimeType: string;
  @ApiProperty() extension: string;
  @ApiProperty() sizeBytes: number;
  @ApiPropertyOptional({ nullable: true }) width: number | null;
  @ApiPropertyOptional({ nullable: true }) height: number | null;
  @ApiPropertyOptional({ nullable: true }) durationSeconds: number | null;
  @ApiPropertyOptional({ type: [String], nullable: true }) tags: string[] | null;
  @ApiProperty() createdAt: Date;
}
