import { promises as fs } from 'fs';
import { extname } from 'path';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { HttpStatus } from '@nestjs/common';

export type MediaKind = 'image' | 'video';

interface AllowedType {
  kind: MediaKind;
  mimeTypes: string[];
  canonicalMime: string;
}

/** Whitelist: extension -> accepted MIME types. */
export const ALLOWED_TYPES: Record<string, AllowedType> = {
  jpg: { kind: 'image', mimeTypes: ['image/jpeg', 'image/pjpeg'], canonicalMime: 'image/jpeg' },
  jpeg: { kind: 'image', mimeTypes: ['image/jpeg', 'image/pjpeg'], canonicalMime: 'image/jpeg' },
  png: { kind: 'image', mimeTypes: ['image/png'], canonicalMime: 'image/png' },
  webp: { kind: 'image', mimeTypes: ['image/webp'], canonicalMime: 'image/webp' },
  mp4: { kind: 'video', mimeTypes: ['video/mp4'], canonicalMime: 'video/mp4' },
  mov: { kind: 'video', mimeTypes: ['video/quicktime'], canonicalMime: 'video/quicktime' },
};

export const ALLOWED_MIME_TYPES = [...new Set(Object.values(ALLOWED_TYPES).flatMap((t) => t.mimeTypes))];

/** Detects the real content type from magic bytes (never trust the client MIME type alone). */
export function sniffType(header: Buffer): 'jpeg' | 'png' | 'webp' | 'isobmff' | null {
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return 'jpeg';
  if (header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (header.length >= 12 && header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  // MP4 / MOV (ISO base media file format): "ftyp" box at offset 4
  if (header.length >= 12 && header.toString('ascii', 4, 8) === 'ftyp') return 'isobmff';
  // Older QuickTime files may start with moov/mdat/wide/free boxes.
  if (header.length >= 8 && ['moov', 'mdat', 'wide', 'free', 'skip'].includes(header.toString('ascii', 4, 8))) return 'isobmff';
  return null;
}

const SNIFF_MATCH: Record<string, ReturnType<typeof sniffType>> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  png: 'png',
  webp: 'webp',
  mp4: 'isobmff',
  mov: 'isobmff',
};

export interface ValidatedFile {
  extension: string;
  mimeType: string;
  kind: MediaKind;
}

/**
 * Validates extension, declared MIME type, magic bytes and size limits.
 * Throws MEDIA_INVALID_TYPE / MEDIA_TOO_LARGE.
 */
export async function validateUploadedFile(
  file: Express.Multer.File,
  limits: { maxImageBytes: number; maxVideoBytes: number },
): Promise<ValidatedFile> {
  const extension = extname(file.originalname).slice(1).toLowerCase();
  const allowed = ALLOWED_TYPES[extension];
  if (!allowed || !allowed.mimeTypes.includes(file.mimetype)) {
    throw new AppException(
      ErrorCode.MEDIA_INVALID_TYPE,
      `Unsupported file type. Allowed: ${Object.keys(ALLOWED_TYPES).join(', ').toUpperCase()}`,
    );
  }

  const handle = await fs.open(file.path, 'r');
  const header = Buffer.alloc(16);
  try {
    await handle.read(header, 0, 16, 0);
  } finally {
    await handle.close();
  }
  if (sniffType(header) !== SNIFF_MATCH[extension]) {
    throw new AppException(ErrorCode.MEDIA_INVALID_TYPE, 'File content does not match its extension');
  }

  const max = allowed.kind === 'image' ? limits.maxImageBytes : limits.maxVideoBytes;
  if (file.size > max) {
    throw new AppException(
      ErrorCode.MEDIA_TOO_LARGE,
      `File is too large. Maximum ${allowed.kind} size is ${Math.round(max / 1024 / 1024)} MB`,
      HttpStatus.PAYLOAD_TOO_LARGE,
    );
  }
  return { extension: extension === 'jpeg' ? 'jpg' : extension, mimeType: allowed.canonicalMime, kind: allowed.kind };
}
