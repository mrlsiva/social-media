import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { imageSize } from 'image-size';
import { In, IsNull, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { BrandAccessService } from '../brands/brand-access.service';
import { BrandsService } from '../brands/brands.service';
import { PaginatedResult } from '../common/dto/paginated-result';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { BrandRole, MediaSource, MediaType, UsageMetric } from '../common/enums';
import { JOBS, QUEUES } from '../common/queues';
import { PostMedia } from '../posts/entities/post-media.entity';
import { ReelMedia } from '../reels/entities/reel-media.entity';
import { UsageService } from '../subscriptions/usage.service';
import { CreateFolderDto, MediaQueryDto, UpdateFolderDto, UpdateMediaDto, UploadMediaDto } from './dto/media.dto';
import { Media } from './entities/media.entity';
import { MediaFolder } from './entities/media-folder.entity';
import { validateUploadedFile } from './file-validation';
import { StorageService } from './storage/storage.service';
import { withQueueTimeout } from '../common/utils/queue';

const EXTENSION_FOR_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
};

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly maxImageBytes: number;
  private readonly maxVideoBytes: number;

  constructor(
    @InjectRepository(Media) private readonly media: Repository<Media>,
    @InjectRepository(MediaFolder) private readonly folders: Repository<MediaFolder>,
    @InjectRepository(PostMedia) private readonly postMedia: Repository<PostMedia>,
    @InjectRepository(ReelMedia) private readonly reelMedia: Repository<ReelMedia>,
    @InjectQueue(QUEUES.MEDIA) private readonly mediaQueue: Queue,
    private readonly storage: StorageService,
    private readonly access: BrandAccessService,
    private readonly brands: BrandsService,
    private readonly usage: UsageService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.maxImageBytes = config.getOrThrow<number>('storage.maxImageSizeMb') * 1024 * 1024;
    this.maxVideoBytes = config.getOrThrow<number>('storage.maxVideoSizeMb') * 1024 * 1024;
  }

  async list(userId: string, brandId: string, query: MediaQueryDto): Promise<PaginatedResult<Media>> {
    await this.access.assert(userId, brandId);
    const qb = this.media
      .createQueryBuilder('m')
      .where('m.brand_id = :brandId', { brandId })
      .orderBy('m.created_at', query.order)
      .skip(query.skip)
      .take(query.limit);
    if (query.type) qb.andWhere('m.type = :type', { type: query.type });
    if (query.source) qb.andWhere('m.source = :source', { source: query.source });
    if (query.folderId === 'root') qb.andWhere('m.folder_id IS NULL');
    else if (query.folderId) qb.andWhere('m.folder_id = :folderId', { folderId: query.folderId });
    if (query.search) {
      qb.andWhere("(m.name LIKE :s OR m.original_name LIKE :s OR JSON_SEARCH(m.tags, 'one', :tag) IS NOT NULL)", {
        s: `%${query.search}%`,
        tag: query.search,
      });
    }
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResult(items, total, query.page, query.limit);
  }

  async get(userId: string, mediaId: string): Promise<Media> {
    const item = await this.media.findOne({ where: { id: mediaId } });
    if (!item) throw AppException.notFound(ErrorCode.MEDIA_NOT_FOUND, 'Media not found');
    await this.access.assert(userId, item.brandId).catch(() => {
      throw AppException.notFound(ErrorCode.MEDIA_NOT_FOUND, 'Media not found');
    });
    return item;
  }

  /** Loads media ensuring every id belongs to the given brand (cross-brand isolation). */
  async getManyForBrand(brandId: string, ids: string[]): Promise<Media[]> {
    if (ids.length === 0) return [];
    const rows = await this.media.find({ where: { id: In(ids), brandId } });
    if (rows.length !== new Set(ids).size) {
      throw AppException.notFound(ErrorCode.MEDIA_NOT_FOUND, 'One or more media items were not found in this brand');
    }
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)!);
  }

  async upload(userId: string, brandId: string, file: Express.Multer.File | undefined, dto: UploadMediaDto): Promise<Media> {
    if (!file) throw new AppException(ErrorCode.MEDIA_UPLOAD_FAILED, 'No file uploaded (field name: "file")');
    try {
      const { brand } = await this.access.assert(userId, brandId, BrandRole.EDITOR);
      if (dto.folderId) await this.getFolder(brandId, dto.folderId);
      const validated = await validateUploadedFile(file, { maxImageBytes: this.maxImageBytes, maxVideoBytes: this.maxVideoBytes });
      await this.usage.assertWithinLimit(brand.ownerId, UsageMetric.STORAGE_MB, Math.ceil(file.size / 1024 / 1024));

      let type: MediaType = validated.kind === 'image' ? MediaType.IMAGE : MediaType.VIDEO;
      if (validated.kind === 'image' && (dto.type === MediaType.LOGO || dto.type === MediaType.THUMBNAIL)) type = dto.type;

      const dimensions = validated.kind === 'image' ? await this.readImageSize(file.path) : null;
      const key = this.buildKey(brandId, validated.extension);
      await this.storage.putFile(file.path, key, validated.mimeType);

      const saved = await this.media.save(
        this.media.create({
          brandId,
          folderId: dto.folderId ?? null,
          uploadedBy: userId,
          type,
          source: MediaSource.UPLOAD,
          name: dto.name ?? file.originalname.slice(0, 255),
          originalName: file.originalname.slice(0, 255),
          storageDriver: this.storage.driver,
          storageKey: key,
          url: this.storage.getPublicUrl(key),
          mimeType: validated.mimeType,
          extension: validated.extension,
          sizeBytes: file.size,
          width: dimensions?.width ?? null,
          height: dimensions?.height ?? null,
          tags: dto.tags ?? null,
          altText: dto.altText ?? null,
        }),
      );

      if (validated.kind === 'video') {
        await withQueueTimeout(this.mediaQueue
          .add(JOBS.MEDIA_PROBE, { mediaId: saved.id }, { removeOnComplete: 1000, removeOnFail: 1000, attempts: 2 }))
          .catch((err: unknown) => this.logger.warn({ err }, 'Could not enqueue media probe'));
      }
      await this.audit.log({ action: 'media.upload', userId, brandId, entityType: 'media', entityId: saved.id });
      return saved;
    } catch (err) {
      if (err instanceof AppException) throw err;
      this.logger.error({ err }, 'Media upload failed');
      throw new AppException(ErrorCode.MEDIA_UPLOAD_FAILED, 'Media upload failed');
    } finally {
      await fs.rm(file.path, { force: true }).catch(() => undefined);
    }
  }

  async uploadLogo(userId: string, brandId: string, file: Express.Multer.File | undefined) {
    await this.access.assert(userId, brandId, BrandRole.ADMIN);
    const media = await this.upload(userId, brandId, file, { type: MediaType.LOGO, name: 'Brand logo' } as UploadMediaDto);
    if (media.type !== MediaType.LOGO) {
      throw new AppException(ErrorCode.MEDIA_INVALID_TYPE, 'Logo must be an image (JPG, PNG or WEBP)');
    }
    await this.brands.setLogo(brandId, media.id, media.url);
    return this.brands.get(userId, brandId);
  }

  /** Saves bytes produced by AI providers / processing jobs into the brand library. */
  async saveGenerated(params: {
    brandId: string;
    userId: string | null;
    buffer: Buffer;
    mimeType: string;
    type: MediaType;
    source: MediaSource;
    name: string;
    aiGenerationId?: string;
    folderId?: string | null;
  }): Promise<Media> {
    const extension = EXTENSION_FOR_MIME[params.mimeType] ?? 'bin';
    const key = this.buildKey(params.brandId, extension);
    await this.storage.putBuffer(params.buffer, key, params.mimeType);
    let width: number | null = null;
    let height: number | null = null;
    if (params.mimeType.startsWith('image/')) {
      try {
        const size = imageSize(params.buffer);
        width = size.width ?? null;
        height = size.height ?? null;
      } catch {
        /* dimensions are optional */
      }
    }
    return this.media.save(
      this.media.create({
        brandId: params.brandId,
        folderId: params.folderId ?? null,
        uploadedBy: params.userId,
        type: params.type,
        source: params.source,
        name: params.name.slice(0, 255),
        originalName: null,
        storageDriver: this.storage.driver,
        storageKey: key,
        url: this.storage.getPublicUrl(key),
        mimeType: params.mimeType,
        extension,
        sizeBytes: params.buffer.length,
        width,
        height,
        aiGenerationId: params.aiGenerationId ?? null,
      }),
    );
  }

  async update(userId: string, mediaId: string, dto: UpdateMediaDto): Promise<Media> {
    const item = await this.get(userId, mediaId);
    await this.access.assert(userId, item.brandId, BrandRole.EDITOR);
    if (dto.folderId) await this.getFolder(item.brandId, dto.folderId);
    await this.media.update({ id: mediaId }, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.folderId !== undefined ? { folderId: dto.folderId } : {}),
      ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
      ...(dto.altText !== undefined ? { altText: dto.altText } : {}),
    });
    return this.get(userId, mediaId);
  }

  /**
   * Soft-deletes the record. The file is removed from storage only when no
   * post/reel references it (published posts keep their media history).
   */
  async remove(userId: string, mediaId: string): Promise<void> {
    const item = await this.get(userId, mediaId);
    await this.access.assert(userId, item.brandId, BrandRole.EDITOR);
    const referenced =
      (await this.postMedia.exists({ where: { mediaId } })) || (await this.reelMedia.exists({ where: { mediaId } }));
    await this.media.softDelete({ id: mediaId });
    if (!referenced) {
      await this.storage.delete(item.storageKey).catch((err: unknown) => this.logger.warn({ err, mediaId }, 'Failed to delete file'));
    }
    await this.audit.log({ action: 'media.delete', userId, brandId: item.brandId, entityType: 'media', entityId: mediaId });
  }

  async updateProbe(mediaId: string, data: { width?: number; height?: number; durationSeconds?: number }): Promise<void> {
    await this.media.update({ id: mediaId }, data);
  }

  findByIdUnsafe(mediaId: string): Promise<Media | null> {
    return this.media.findOne({ where: { id: mediaId }, withDeleted: true });
  }

  // ---------------------------------------------------------------- folders

  async listFolders(userId: string, brandId: string) {
    await this.access.assert(userId, brandId);
    const folders = await this.folders.find({ where: { brandId }, order: { name: 'ASC' } });
    const counts = await this.media
      .createQueryBuilder('m')
      .select('m.folder_id', 'folderId')
      .addSelect('COUNT(*)', 'count')
      .where('m.brand_id = :brandId AND m.folder_id IS NOT NULL', { brandId })
      .groupBy('m.folder_id')
      .getRawMany<{ folderId: string; count: string }>();
    const countMap = new Map(counts.map((c) => [c.folderId, Number(c.count)]));
    return folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, mediaCount: countMap.get(f.id) ?? 0, createdAt: f.createdAt }));
  }

  async createFolder(userId: string, brandId: string, dto: CreateFolderDto) {
    await this.access.assert(userId, brandId, BrandRole.EDITOR);
    if (dto.parentId) await this.getFolder(brandId, dto.parentId);
    const duplicate = await this.folders.exists({
      where: { brandId, name: dto.name, parentId: dto.parentId ?? IsNull() },
    });
    if (duplicate) throw AppException.conflict(ErrorCode.CONFLICT, 'A folder with this name already exists');
    return this.folders.save(this.folders.create({ brandId, name: dto.name, parentId: dto.parentId ?? null }));
  }

  async renameFolder(userId: string, folderId: string, dto: UpdateFolderDto) {
    const folder = await this.folders.findOne({ where: { id: folderId } });
    if (!folder) throw AppException.notFound(ErrorCode.NOT_FOUND, 'Folder not found');
    await this.access.assert(userId, folder.brandId, BrandRole.EDITOR);
    folder.name = dto.name;
    return this.folders.save(folder);
  }

  /** Deletes a folder; media inside moves to the root (FK ON DELETE SET NULL). */
  async removeFolder(userId: string, folderId: string): Promise<void> {
    const folder = await this.folders.findOne({ where: { id: folderId } });
    if (!folder) throw AppException.notFound(ErrorCode.NOT_FOUND, 'Folder not found');
    await this.access.assert(userId, folder.brandId, BrandRole.EDITOR);
    await this.folders.delete({ id: folderId });
  }

  private async getFolder(brandId: string, folderId: string): Promise<MediaFolder> {
    const folder = await this.folders.findOne({ where: { id: folderId, brandId } });
    if (!folder) throw AppException.notFound(ErrorCode.NOT_FOUND, 'Folder not found');
    return folder;
  }

  private async readImageSize(path: string): Promise<{ width?: number; height?: number } | null> {
    try {
      return imageSize(await fs.readFile(path));
    } catch {
      return null;
    }
  }

  private buildKey(brandId: string, extension: string): string {
    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `brands/${brandId}/${now.getUTCFullYear()}/${month}/${randomUUID()}.${extension}`;
  }
}
