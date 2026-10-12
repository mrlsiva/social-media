import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { QUEUES } from '../common/queues';
import { PostMedia } from '../posts/entities/post-media.entity';
import { ReelMedia } from '../reels/entities/reel-media.entity';
import { Media } from './entities/media.entity';
import { MediaFolder } from './entities/media-folder.entity';
import { ALLOWED_MIME_TYPES } from './file-validation';
import { MediaController } from './media.controller';
import { MediaProcessor } from './media.processor';
import { MediaService } from './media.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Media, MediaFolder, PostMedia, ReelMedia]),
    BullModule.registerQueue({ name: QUEUES.MEDIA }),
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const tempDir = join(tmpdir(), 'socialpilot-uploads');
        mkdirSync(tempDir, { recursive: true });
        const maxMb = Math.max(
          config.getOrThrow<number>('storage.maxVideoSizeMb'),
          config.getOrThrow<number>('storage.maxImageSizeMb'),
        );
        return {
          // Stream to disk (never buffer large videos in memory).
          storage: diskStorage({
            destination: tempDir,
            filename: (_req, _file, cb) => cb(null, randomUUID()),
          }),
          limits: { fileSize: maxMb * 1024 * 1024, files: 10, fields: 20 },
          // Early rejection by declared MIME type; content is re-validated by magic bytes.
          fileFilter: (_req, file, cb) =>
            ALLOWED_MIME_TYPES.includes(file.mimetype)
              ? cb(null, true)
              : cb(new AppException(ErrorCode.MEDIA_INVALID_TYPE, 'Unsupported file type. Allowed: JPG, JPEG, PNG, WEBP, MP4, MOV'), false),
        };
      },
    }),
  ],
  controllers: [MediaController],
  providers: [MediaService, MediaProcessor],
  exports: [MediaService],
})
export class MediaModule {}
