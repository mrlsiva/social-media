import type { Readable } from 'stream';

/**
 * Storage abstraction. All file I/O in the app goes through this class so the
 * local disk driver can be swapped for S3 (STORAGE_DRIVER=s3) without code changes.
 *
 * Keys are POSIX-style relative paths, e.g. `brands/<brandId>/2026/10/<uuid>.jpg`.
 */
export abstract class StorageService {
  abstract readonly driver: 'local' | 's3';

  /** Moves/uploads a local temp file (e.g. multer upload) into storage. */
  abstract putFile(localPath: string, key: string, contentType: string): Promise<void>;

  abstract putBuffer(buffer: Buffer, key: string, contentType: string): Promise<void>;

  abstract delete(key: string): Promise<void>;

  abstract exists(key: string): Promise<boolean>;

  abstract move(fromKey: string, toKey: string): Promise<void>;

  abstract openStream(key: string): Promise<Readable>;

  /** File-backed Blob for multipart/binary uploads to platform APIs. */
  abstract toBlob(key: string, contentType: string): Promise<Blob>;

  abstract read(key: string): Promise<Buffer>;

  /** URL clients (and Instagram/Facebook servers) can fetch the file from. */
  abstract getPublicUrl(key: string): string;
}

/** Normalises and validates a storage key (prevents path traversal). */
export function assertSafeKey(key: string): string {
  const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some((part) => part === '..' || part === '.' || part === '')) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
  return normalized;
}
