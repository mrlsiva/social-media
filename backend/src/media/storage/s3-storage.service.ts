import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, promises as fs } from 'fs';
import { Readable } from 'stream';
import type { StorageConfig } from '../../config/configuration';
import { assertSafeKey, StorageService } from './storage.service';

/**
 * AWS S3 driver (STORAGE_DRIVER=s3). Objects must be publicly readable
 * (bucket policy or CloudFront via AWS_S3_PUBLIC_URL) because Instagram and
 * Facebook fetch media by URL.
 */
@Injectable()
export class S3StorageService extends StorageService {
  readonly driver = 's3' as const;
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBase: string;

  constructor(config: ConfigService) {
    super();
    const s3 = config.getOrThrow<StorageConfig>('storage').s3;
    if (!s3.bucket || !s3.region) throw new Error('AWS_S3_BUCKET and AWS_REGION are required when STORAGE_DRIVER=s3');
    this.bucket = s3.bucket;
    this.client = new S3Client({
      region: s3.region,
      ...(s3.accessKeyId && s3.secretAccessKey
        ? { credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey } }
        : {}),
    });
    this.publicBase = (s3.publicUrl || `https://${s3.bucket}.s3.${s3.region}.amazonaws.com`).replace(/\/$/, '');
  }

  async putFile(localPath: string, key: string, contentType: string): Promise<void> {
    const { size } = await fs.stat(localPath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: assertSafeKey(key),
        Body: createReadStream(localPath),
        ContentLength: size,
        ContentType: contentType,
      }),
    );
    await fs.unlink(localPath).catch(() => undefined);
  }

  async putBuffer(buffer: Buffer, key: string, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(key), Body: buffer, ContentType: contentType }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(key) }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(key) }));
      return true;
    } catch {
      return false;
    }
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${assertSafeKey(fromKey)}`,
        Key: assertSafeKey(toKey),
      }),
    );
    await this.delete(fromKey);
  }

  async openStream(key: string): Promise<Readable> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(key) }));
    return res.Body as Readable;
  }

  async read(key: string): Promise<Buffer> {
    const stream = await this.openStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
  }

  async toBlob(key: string, contentType: string): Promise<Blob> {
    return new Blob([new Uint8Array(await this.read(key))], { type: contentType });
  }

  getPublicUrl(key: string): string {
    return `${this.publicBase}/${assertSafeKey(key).split('/').map(encodeURIComponent).join('/')}`;
  }
}
