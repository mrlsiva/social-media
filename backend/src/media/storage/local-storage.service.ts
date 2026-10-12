import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, promises as fs, openAsBlob } from 'fs';
import { dirname, resolve, sep } from 'path';
import type { Readable } from 'stream';
import { assertSafeKey, StorageService } from './storage.service';

/** Stores files on local disk under STORAGE_LOCAL_PATH and serves them from APP_URL/uploads. */
@Injectable()
export class LocalStorageService extends StorageService {
  readonly driver = 'local' as const;
  private readonly root: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    super();
    this.root = resolve(config.getOrThrow<string>('storage.localPath'));
    this.baseUrl = `${config.getOrThrow<string>('app.url')}/uploads`;
  }

  get rootPath(): string {
    return this.root;
  }

  private pathFor(key: string): string {
    const full = resolve(this.root, assertSafeKey(key));
    if (!full.startsWith(this.root + sep)) throw new Error('Storage key escapes storage root');
    return full;
  }

  async putFile(localPath: string, key: string): Promise<void> {
    const target = this.pathFor(key);
    await fs.mkdir(dirname(target), { recursive: true });
    try {
      await fs.rename(localPath, target);
    } catch (err) {
      // Cross-device rename (temp dir on another drive): copy + delete.
      if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
      await fs.copyFile(localPath, target);
      await fs.unlink(localPath);
    }
  }

  async putBuffer(buffer: Buffer, key: string): Promise<void> {
    const target = this.pathFor(key);
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.writeFile(target, buffer);
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.pathFor(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    return fs
      .access(this.pathFor(key))
      .then(() => true)
      .catch(() => false);
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    await this.putFile(this.pathFor(fromKey), toKey);
  }

  async openStream(key: string): Promise<Readable> {
    return createReadStream(this.pathFor(key));
  }

  async toBlob(key: string, contentType: string): Promise<Blob> {
    return openAsBlob(this.pathFor(key), { type: contentType });
  }

  read(key: string): Promise<Buffer> {
    return fs.readFile(this.pathFor(key));
  }

  getPublicUrl(key: string): string {
    return `${this.baseUrl}/${assertSafeKey(key).split('/').map(encodeURIComponent).join('/')}`;
  }
}
