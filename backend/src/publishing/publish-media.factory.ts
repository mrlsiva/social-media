import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { MediaSource } from '../common/enums';
import { Media } from '../media/entities/media.entity';
import { StorageService } from '../media/storage/storage.service';
import { PublishMedia } from './interfaces/social-publisher.interface';
import { isLocalUrl } from './publisher-http';

/** Wraps library media into the storage-agnostic shape publishers consume. */
@Injectable()
export class PublishMediaFactory {
  constructor(private readonly storage: StorageService) {}

  create(media: Media): PublishMedia {
    const url = this.storage.getPublicUrl(media.storageKey);
    return {
      id: media.id,
      kind: media.mimeType.startsWith('video/') ? 'video' : 'image',
      mimeType: media.mimeType,
      url,
      sizeBytes: media.sizeBytes,
      width: media.width,
      height: media.height,
      durationSeconds: media.durationSeconds,
      aiGenerated: media.source === MediaSource.AI_IMAGE || media.source === MediaSource.AI_VIDEO,
      isPubliclyReachable: !isLocalUrl(url),
      toBlob: () => this.storage.toBlob(media.storageKey, media.mimeType),
      jpegUrl: () => this.jpegUrl(media),
    };
  }

  /** Instagram accepts JPEG only: create (once) and return a JPEG rendition. */
  private async jpegUrl(media: Media): Promise<string> {
    if (media.mimeType === 'image/jpeg') return this.storage.getPublicUrl(media.storageKey);
    const key = `${media.storageKey.replace(/\.[^.]+$/, '')}.publish.jpg`;
    if (!(await this.storage.exists(key))) {
      const source = await this.storage.read(media.storageKey);
      const jpeg = await sharp(source).flatten({ background: '#ffffff' }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
      await this.storage.putBuffer(jpeg, key, 'image/jpeg');
    }
    return this.storage.getPublicUrl(key);
  }
}
