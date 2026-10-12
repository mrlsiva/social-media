import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { JOBS, QUEUES } from '../common/queues';
import { MediaService } from './media.service';
import { StorageService } from './storage/storage.service';

const execFileAsync = promisify(execFile);

interface FfprobeOutput {
  streams?: { codec_type?: string; width?: number; height?: number }[];
  format?: { duration?: string };
}

/**
 * Media processing jobs. Video probing uses ffprobe when available
 * (FFPROBE_PATH, default "ffprobe" on PATH); without it the job is a no-op and
 * dimensions/duration stay null (platform-side validation still applies).
 */
@Processor(QUEUES.MEDIA)
export class MediaProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessor.name);
  private readonly ffprobe: string;

  constructor(
    private readonly media: MediaService,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    super();
    this.ffprobe = config.get<string>('FFPROBE_PATH') ?? 'ffprobe';
  }

  async process(job: Job<{ mediaId: string }>): Promise<unknown> {
    if (job.name !== JOBS.MEDIA_PROBE) return null;
    const item = await this.media.findByIdUnsafe(job.data.mediaId);
    if (!item) return null;

    const url = this.storage.driver === 'local' ? this.storage.getPublicUrl(item.storageKey) : item.url;
    try {
      const { stdout } = await execFileAsync(
        this.ffprobe,
        ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', url],
        { timeout: 60_000 },
      );
      const data = JSON.parse(stdout) as FfprobeOutput;
      const video = data.streams?.find((s) => s.codec_type === 'video');
      const duration = data.format?.duration ? Number(data.format.duration) : undefined;
      await this.media.updateProbe(item.id, {
        width: video?.width,
        height: video?.height,
        durationSeconds: duration && !Number.isNaN(duration) ? Math.round(duration * 100) / 100 : undefined,
      });
      return { probed: true };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.debug('ffprobe not installed - skipping video probe');
        return { probed: false, reason: 'ffprobe not available' };
      }
      this.logger.warn({ err, mediaId: item.id }, 'Video probe failed');
      return { probed: false };
    }
  }
}
