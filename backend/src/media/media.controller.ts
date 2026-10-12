import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/auth.decorators';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { ApiEnvelope, ApiPaginatedEnvelope, ApiStandardErrors } from '../common/swagger/api-responses';
import { BrandResponseDto } from '../brands/dto/brand.dto';
import {
  BulkUploadMediaDto,
  CreateFolderDto,
  LogoUploadDto,
  MediaQueryDto,
  MediaResponseDto,
  UpdateFolderDto,
  UpdateMediaDto,
  UploadMediaDto,
} from './dto/media.dto';
import { MediaService } from './media.service';

@ApiTags('Media Library')
@ApiBearerAuth()
@ApiStandardErrors()
@Controller()
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get('brands/:brandId/media')
  @ApiOperation({ summary: "List a brand's media (filter by type, source, folder; search by name/tag)" })
  @ApiPaginatedEnvelope(MediaResponseDto)
  list(@CurrentUser() user: AuthUser, @Param('brandId', ParseUUIDPipe) brandId: string, @Query() query: MediaQueryDto) {
    return this.media.list(user.id, brandId, query);
  }

  @Post('brands/:brandId/media')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadMediaDto })
  @ApiOperation({ summary: 'Upload an image or video (JPG/JPEG/PNG/WEBP/MP4/MOV, validated by content)' })
  @ApiEnvelope(MediaResponseDto)
  @ResponseMessage('Media uploaded')
  upload(
    @CurrentUser() user: AuthUser,
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadMediaDto,
  ) {
    return this.media.upload(user.id, brandId, file, dto);
  }

  @Post('brands/:brandId/media/bulk')
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: BulkUploadMediaDto })
  @ApiOperation({ summary: 'Upload up to 10 files at once' })
  @ApiEnvelope(MediaResponseDto, { isArray: true })
  @ResponseMessage('Media uploaded')
  async bulkUpload(
    @CurrentUser() user: AuthUser,
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @UploadedFiles() files: Express.Multer.File[] = [],
    @Body() dto: BulkUploadMediaDto,
  ) {
    const results = [];
    for (const file of files) {
      results.push(await this.media.upload(user.id, brandId, file, { folderId: dto.folderId } as UploadMediaDto));
    }
    return results;
  }

  @Post('brands/:brandId/logo')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: LogoUploadDto })
  @ApiOperation({ summary: 'Upload and set the brand logo' })
  @ApiEnvelope(BrandResponseDto)
  @ResponseMessage('Logo updated')
  uploadLogo(
    @CurrentUser() user: AuthUser,
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.media.uploadLogo(user.id, brandId, file);
  }

  @Get('media/:id')
  @ApiOperation({ summary: 'Get a media item' })
  @ApiEnvelope(MediaResponseDto)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.media.get(user.id, id);
  }

  @Patch('media/:id')
  @ApiOperation({ summary: 'Rename / move to folder / tag a media item' })
  @ApiEnvelope(MediaResponseDto)
  @ResponseMessage('Media updated')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMediaDto) {
    return this.media.update(user.id, id, dto);
  }

  @Delete('media/:id')
  @ApiOperation({ summary: 'Delete a media item' })
  @ApiEnvelope()
  @ResponseMessage('Media deleted')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.media.remove(user.id, id);
    return null;
  }

  @Get('brands/:brandId/media-folders')
  @ApiOperation({ summary: 'List media folders with item counts' })
  folders(@CurrentUser() user: AuthUser, @Param('brandId', ParseUUIDPipe) brandId: string) {
    return this.media.listFolders(user.id, brandId);
  }

  @Post('brands/:brandId/media-folders')
  @ApiOperation({ summary: 'Create a media folder' })
  @ResponseMessage('Folder created')
  createFolder(@CurrentUser() user: AuthUser, @Param('brandId', ParseUUIDPipe) brandId: string, @Body() dto: CreateFolderDto) {
    return this.media.createFolder(user.id, brandId, dto);
  }

  @Patch('media-folders/:id')
  @ApiOperation({ summary: 'Rename a media folder' })
  @ResponseMessage('Folder renamed')
  renameFolder(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFolderDto) {
    return this.media.renameFolder(user.id, id, dto);
  }

  @Delete('media-folders/:id')
  @ApiOperation({ summary: 'Delete a folder (its media moves to the root)' })
  @ResponseMessage('Folder deleted')
  async removeFolder(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.media.removeFolder(user.id, id);
    return null;
  }
}
