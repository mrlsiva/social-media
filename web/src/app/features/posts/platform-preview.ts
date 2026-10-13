import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { Brand, ContentType, Platform } from '../../core/models';
import { initials } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { PLATFORM_META, PlatformIcon } from '../../shared/platform';

export interface PreviewMedia {
  url: string;
  isVideo: boolean;
}

export interface PreviewPlatformText {
  platform: Platform;
  caption: string;
  hashtags: string[];
  title?: string | null;
}

const LIMITS: Record<string, number> = { instagram: 2200, facebook: 63206, linkedin: 3000, youtube: 5000 };

/** Mirrors the backend composer closely enough for an honest approximation. */
export function composePreviewText(p: PreviewPlatformText, extra: { cta?: string | null; linkUrl?: string | null; mentions?: string[] }): string {
  const blocks = [p.caption.trim()];
  if (extra.cta && !p.caption.toLowerCase().includes(extra.cta.toLowerCase())) blocks.push(extra.cta);
  if (extra.linkUrl && !p.caption.includes(extra.linkUrl)) blocks.push(p.platform === 'instagram' ? '🔗 Link in bio' : extra.linkUrl);
  if (extra.mentions?.length && (p.platform === 'instagram' || p.platform === 'facebook')) blocks.push(extra.mentions.map((m) => `@${m}`).join(' '));
  const tags = p.hashtags.map((h) => `#${h}`).join(' ');
  if (tags) blocks.push(tags);
  return blocks.filter(Boolean).join('\n\n');
}

@Component({
  selector: 'app-platform-preview',
  imports: [Icon, PlatformIcon, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './platform-preview.html',
  styleUrl: './platform-preview.scss',
})
export class PlatformPreview {
  readonly brand = input<Brand | null>(null);
  readonly platforms = input<Platform[]>([]);
  readonly texts = input<PreviewPlatformText[]>([]);
  readonly media = input<PreviewMedia[]>([]);
  readonly contentType = input<ContentType>('image');
  readonly cta = input<string | null>(null);
  readonly linkUrl = input<string | null>(null);
  readonly mentions = input<string[]>([]);

  protected readonly selected = signal<Platform | null>(null);
  protected readonly slide = signal(0);
  protected readonly initials = initials;
  protected readonly meta = PLATFORM_META;

  protected readonly tabs = computed<Platform[]>(() => {
    const list = this.platforms();
    return list.length ? list : ['instagram', 'facebook', 'youtube', 'linkedin'];
  });
  protected readonly active = computed<Platform>(() => {
    const sel = this.selected();
    return sel && this.tabs().includes(sel) ? sel : this.tabs()[0];
  });
  protected readonly text = computed(() => {
    const t = this.texts().find((x) => x.platform === this.active()) ?? { platform: this.active(), caption: '', hashtags: [] };
    return composePreviewText(t, { cta: this.cta(), linkUrl: this.linkUrl(), mentions: this.mentions() });
  });
  protected readonly igHandle = computed(() => (this.brand()?.name ?? 'yourbrand').toLowerCase().replace(/\s+/g, ''));
  protected readonly title = computed(() => this.texts().find((x) => x.platform === this.active())?.title ?? '');
  protected readonly limit = computed(() => LIMITS[this.active()] ?? 3000);
  protected readonly isVertical = computed(() => this.contentType() === 'reel');
  protected readonly current = computed(() => this.media()[Math.min(this.slide(), Math.max(0, this.media().length - 1))] ?? null);

  protected readonly warnings = computed(() => {
    const w: string[] = [];
    const p = this.active();
    const media = this.media();
    if (this.text().length > this.limit()) w.push(`Caption is ${this.text().length}/${this.limit()} characters`);
    if (p === 'instagram' && media.length === 0) w.push('Instagram requires an image or video');
    if (p === 'youtube' && !media.some((m) => m.isVideo)) w.push('YouTube only accepts video uploads');
    if (p === 'youtube' && !this.title()) w.push('YouTube needs a video title');
    if (p === 'instagram' && this.contentType() === 'carousel' && media.length < 2) w.push('Instagram carousels need 2-10 items');
    const tags = this.texts().find((x) => x.platform === p)?.hashtags.length ?? 0;
    if (p === 'instagram' && tags > 30) w.push('Instagram allows at most 30 hashtags');
    return w;
  });

  /** Highlights #hashtags and @mentions like the real apps. */
  protected readonly richText = computed(() =>
    this.escape(this.text()).replace(/(^|\s)([#@][\p{L}\p{N}_]+)/gu, '$1<span class="hl">$2</span>').replace(/\n/g, '<br>'),
  );

  select(p: Platform) {
    this.selected.set(p);
    this.slide.set(0);
  }

  private escape(s: string) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  }
}
