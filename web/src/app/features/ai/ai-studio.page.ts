import { DatePipe, JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { BrandContextService } from '../../core/brand-context.service';
import { AiJobStatus, AiResult, Media, PageMeta, Platform } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { AiImageDialog } from '../../shared/ai-image-dialog';
import { Icon } from '../../shared/icon';
import { PLATFORM_META, PlatformIcon } from '../../shared/platform';
import { StatusBadge } from '../../shared/status-badge';

type Tab = 'caption' | 'hashtags' | 'ideas' | 'reels' | 'script' | 'platform' | 'image' | 'video' | 'history';

interface HistoryItem {
  id: string;
  type: string;
  status: string;
  input: Record<string, unknown>;
  output: unknown;
  createdAt: string;
  errorMessage: string | null;
}

@Component({
  selector: 'app-ai-studio-page',
  imports: [FormsModule, Icon, PlatformIcon, StatusBadge, AiImageDialog, DatePipe, JsonPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ai-studio.page.html',
  styleUrl: './ai-studio.page.scss',
})
export class AiStudioPage implements OnDestroy {
  readonly tab = input<Tab>();
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly brands = inject(BrandContextService);
  protected readonly meta = PLATFORM_META;

  protected readonly active = signal<Tab>('caption');
  protected readonly busy = signal(false);
  protected readonly result = signal<any>(null);
  protected readonly showImage = signal(false);
  protected readonly video = signal<AiJobStatus | null>(null);
  protected readonly history = signal<HistoryItem[]>([]);
  protected readonly historyMeta = signal<PageMeta | null>(null);
  protected brief = { topic: '', productService: '', targetAudience: '', language: '', tone: '', objective: '', offer: '', additionalInstructions: '', contentType: '' };
  protected opts = { platform: '', count: 5, durationSeconds: 30, platforms: ['instagram', 'facebook', 'linkedin', 'youtube'] as Platform[] };
  protected videoForm = { durationSeconds: 8, style: '', voice: '', musicPreference: '', aspect: 'portrait', subtitles: true, cta: '' };
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected readonly tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'caption', label: 'Captions', icon: 'edit' },
    { id: 'hashtags', label: 'Hashtags', icon: 'hash' },
    { id: 'ideas', label: 'Post ideas', icon: 'lightbulb' },
    { id: 'reels', label: 'Reel ideas', icon: 'film' },
    { id: 'script', label: 'Reel script', icon: 'list' },
    { id: 'platform', label: 'Per-platform', icon: 'layers' },
    { id: 'image', label: 'Image', icon: 'image' },
    { id: 'video', label: 'Video / Reel', icon: 'video' },
    { id: 'history', label: 'History', icon: 'clock' },
  ];

  ngOnInit() {
    const t = this.tab();
    if (t) this.select(t);
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  select(t: Tab) {
    this.active.set(t);
    this.result.set(null);
    if (t === 'history') this.loadHistory(1);
  }

  togglePlatform(p: Platform) {
    this.opts.platforms = this.opts.platforms.includes(p) ? this.opts.platforms.filter((x) => x !== p) : [...this.opts.platforms, p];
  }

  private body(extra: Record<string, unknown> = {}) {
    const clean = Object.fromEntries(Object.entries(this.brief).filter(([, v]) => v));
    return { brandId: this.brands.currentBrandId(), ...clean, ...extra };
  }

  generate() {
    const map: Partial<Record<Tab, [string, Record<string, unknown>]>> = {
      caption: ['/ai/caption', { variants: 3, platform: this.opts.platform || undefined }],
      hashtags: ['/ai/hashtags', { count: 20, platform: this.opts.platform || undefined }],
      ideas: ['/ai/post-ideas', { count: this.opts.count }],
      reels: ['/ai/reel-ideas', { count: this.opts.count }],
      script: ['/ai/reel-script', { durationSeconds: this.opts.durationSeconds }],
      platform: ['/ai/platform-content', { platforms: this.opts.platforms }],
    };
    const entry = map[this.active()];
    if (!entry) return;
    this.busy.set(true);
    this.result.set(null);
    this.api.post<AiResult<unknown>>(entry[0], this.body(entry[1])).subscribe({
      next: (r) => {
        this.result.set(r.result);
        this.busy.set(false);
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }

  generateVideo() {
    if (!this.brief.topic) return this.toast.warning('Enter a topic');
    this.busy.set(true);
    this.video.set(null);
    const body = {
      brandId: this.brands.currentBrandId(),
      topic: this.brief.topic,
      productService: this.brief.productService || undefined,
      language: this.brief.language || undefined,
      durationSeconds: this.videoForm.durationSeconds,
      style: this.videoForm.style || undefined,
      voice: this.videoForm.voice || undefined,
      musicPreference: this.videoForm.musicPreference || undefined,
      aspect: this.videoForm.aspect,
      subtitles: this.videoForm.subtitles,
      cta: this.videoForm.cta || undefined,
    };
    this.api.post<{ jobId: string }>('/ai/videos', body).subscribe({
      next: (r) => this.pollVideo(r.jobId),
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }

  private pollVideo(jobId: string) {
    this.api.get<AiJobStatus>(`/ai/videos/${jobId}`).subscribe({
      next: (s) => {
        this.video.set(s);
        if (s.status === 'completed' || s.status === 'failed') this.busy.set(false);
        else this.timer = setTimeout(() => this.pollVideo(jobId), 5000);
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }

  useVideo() {
    const id = this.video()?.mediaId;
    if (id) void this.router.navigate(['/reels/new'], { queryParams: { media: id } });
  }

  useCaption(text: string) {
    void this.router.navigate(['/posts/new'], { queryParams: { caption: text } });
  }

  onImageUsed(m: Media) {
    this.showImage.set(false);
    void this.router.navigate(['/posts/new'], { queryParams: { media: m.id } });
  }

  copy(text: string) {
    void navigator.clipboard.writeText(text).then(() => this.toast.success('Copied'));
  }

  loadHistory(page: number) {
    const brandId = this.brands.currentBrandId();
    this.api.list<HistoryItem>('/ai/generations', { brandId: brandId ?? undefined, page, limit: 15 }).subscribe((r) => {
      this.history.set(r.items);
      this.historyMeta.set(r.meta);
    });
  }

  asText(v: unknown): string {
    return Array.isArray(v) ? v.map((x) => `#${x}`).join(' ') : String(v ?? '');
  }
}
