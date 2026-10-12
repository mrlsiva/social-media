import { DatePipe, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, of, switchMap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { BrandContextService } from '../../core/brand-context.service';
import {
  AiResult,
  ContentType,
  Media,
  Platform,
  PlatformStatus,
  Post,
  PostPlatformOptions,
  PublishBatch,
  PublishingJob,
  ReelData,
  SocialAccount,
  TextOverlay,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { AiImageDialog } from '../../shared/ai-image-dialog';
import { toLocalInput } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { MediaPicker } from '../../shared/media-picker';
import { Modal } from '../../shared/modal';
import { PLATFORM_META, PlatformIcon } from '../../shared/platform';
import { StatusBadge } from '../../shared/status-badge';
import { PlatformPreview, PreviewMedia, PreviewPlatformText } from './platform-preview';

interface EditorMedia {
  id: string;
  url: string;
  mimeType: string;
}

interface Override {
  captionOverride: string;
  hashtagsOverride: string[] | null;
  titleOverride: string;
  options: PostPlatformOptions;
}

const LOCKED: Post['status'][] = ['publishing', 'published'];

@Component({
  selector: 'app-post-editor-page',
  imports: [FormsModule, RouterLink, Icon, PlatformIcon, StatusBadge, PlatformPreview, MediaPicker, AiImageDialog, Modal, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './post-editor.page.html',
  styleUrl: './post-editor.page.scss',
})
export class PostEditorPage implements OnDestroy {
  readonly id = input<string>();
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  protected readonly brands = inject(BrandContextService);
  protected readonly meta = PLATFORM_META;

  // ---- content state
  protected readonly post = signal<Post | null>(null);
  protected readonly contentType = signal<ContentType>(this.route.snapshot.data['reel'] ? 'reel' : 'image');
  protected title = '';
  protected readonly caption = signal('');
  protected readonly hashtags = signal<string[]>([]);
  protected readonly mentions = signal<string[]>([]);
  protected readonly cta = signal('');
  protected readonly linkUrl = signal('');
  protected readonly videoTitle = signal('');
  protected videoDescription = '';
  protected readonly media = signal<EditorMedia[]>([]);
  protected readonly thumbnail = signal<EditorMedia | null>(null);
  protected readonly reel = signal<ReelData>({ script: { hook: '', mainContent: '', cta: '', ending: '' }, textOverlays: [], voiceOverEnabled: false, subtitlesEnabled: false });
  protected scheduleAt = toLocalInput(new Date(Date.now() + 3600_000));
  protected hashtagInput = '';
  protected mentionInput = '';

  // ---- destinations
  protected readonly accounts = signal<SocialAccount[]>([]);
  protected readonly selected = signal<Set<string>>(new Set());
  protected readonly overrides = signal<Record<string, Override>>({});
  protected readonly showOverrides = signal(false);

  // ---- ui state
  protected readonly picker = signal<'media' | 'thumbnail' | null>(null);
  protected readonly aiImage = signal(false);
  protected readonly aiPanel = signal<'caption' | 'hashtags' | 'reel' | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly status = signal<PlatformStatus[]>([]);
  protected readonly jobDetail = signal<PublishingJob | null>(null);
  protected readonly aiCaptions = signal<{ hook: string; text: string }[]>([]);
  protected brief = { topic: '', productService: '', targetAudience: '', tone: '', language: '', objective: '', offer: '', additionalInstructions: '' };
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private hydratedForBrand: string | null = null;

  // ---- derived
  protected readonly brand = this.brands.currentBrand;
  protected readonly locked = computed(() => LOCKED.includes(this.post()?.status ?? 'draft'));
  protected readonly connected = computed(() => this.accounts().filter((a) => a.status === 'connected'));
  protected readonly selectedAccounts = computed(() => this.accounts().filter((a) => this.selected().has(a.id)));
  protected readonly selectedPlatforms = computed(() => [...new Set(this.selectedAccounts().map((a) => a.platform))]);
  protected readonly isVideo = computed(() => this.contentType() === 'video' || this.contentType() === 'reel');
  protected readonly previewMedia = computed<PreviewMedia[]>(() => this.media().map((m) => ({ url: m.url, isVideo: m.mimeType.startsWith('video/') })));
  protected readonly previewTexts = computed<PreviewPlatformText[]>(() => {
    const ov = this.overrides();
    const accounts = this.selectedAccounts().length ? this.selectedAccounts() : [];
    const platforms: { platform: Platform; accountId?: string }[] = accounts.length
      ? accounts.map((a) => ({ platform: a.platform, accountId: a.id }))
      : (['instagram', 'facebook', 'youtube', 'linkedin'] as Platform[]).map((p) => ({ platform: p }));
    return platforms.map(({ platform, accountId }) => {
      const o = accountId ? ov[accountId] : undefined;
      return {
        platform,
        caption: o?.captionOverride || this.caption(),
        hashtags: o?.hashtagsOverride ?? this.hashtags(),
        title: o?.titleOverride || this.videoTitle() || this.title || null,
      };
    });
  });
  protected readonly publishing = computed(() => this.status().some((s) => s.status === 'queued' || s.status === 'publishing'));
  protected readonly failedCount = computed(() => this.status().filter((s) => s.status === 'failed').length);

  constructor() {
    // Load the post (edit mode) or apply query params (new mode).
    effect(() => {
      const id = this.id();
      untracked(() => (id ? this.load(id) : this.applyQueryParams()));
    });
    // Load the brand's connected accounts whenever the brand changes.
    effect(() => {
      const brandId = this.brands.currentBrandId();
      if (!brandId) return;
      untracked(() =>
        this.api.list<SocialAccount>('/social-accounts', { brandId, page: 1, limit: 100 }).subscribe((r) => {
          this.accounts.set(r.items);
          if (!this.id() && this.hydratedForBrand !== brandId) {
            this.hydratedForBrand = brandId;
            this.selected.set(new Set(r.items.filter((a) => a.status === 'connected' && this.supports(a.platform)).map((a) => a.id)));
          }
        }),
      );
    });
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
  }

  // ------------------------------------------------------------------ loading

  private load(id: string) {
    this.api.get<Post>(`/posts/${id}`).subscribe({
      next: (p) => {
        if (p.brandId !== this.brands.currentBrandId()) this.brands.select(p.brandId);
        this.post.set(p);
        this.contentType.set(p.contentType);
        this.title = p.title ?? '';
        this.caption.set(p.caption ?? '');
        this.hashtags.set(p.hashtags);
        this.mentions.set(p.mentions);
        this.cta.set(p.cta ?? '');
        this.linkUrl.set(p.linkUrl ?? '');
        this.videoTitle.set(p.videoTitle ?? '');
        this.videoDescription = p.videoDescription ?? '';
        this.media.set(p.media.map((m) => ({ id: m.id, url: m.url, mimeType: m.mimeType })));
        this.thumbnail.set(p.thumbnail ? { id: p.thumbnail.id, url: p.thumbnail.url, mimeType: p.thumbnail.mimeType } : null);
        if (p.reel) this.reel.set({ ...this.reel(), ...p.reel, script: p.reel.script ?? this.reel().script, textOverlays: p.reel.textOverlays ?? [] });
        if (p.scheduledAt) this.scheduleAt = toLocalInput(new Date(p.scheduledAt));
        this.selected.set(new Set(p.platforms.map((pp) => pp.socialAccountId)));
        const ov: Record<string, Override> = {};
        for (const pp of p.platforms) {
          ov[pp.socialAccountId] = { captionOverride: pp.captionOverride ?? '', hashtagsOverride: pp.hashtagsOverride, titleOverride: pp.titleOverride ?? '', options: pp.options ?? {} };
        }
        this.overrides.set(ov);
        this.showOverrides.set(p.platforms.some((pp) => pp.captionOverride));
        this.refreshStatus();
      },
      error: (e) => {
        this.toast.error(e);
        void this.router.navigate(['/posts']);
      },
    });
  }

  private applyQueryParams() {
    const q = this.route.snapshot.queryParamMap;
    const mediaId = q.get('media');
    if (mediaId) {
      this.api.get<Media>(`/media/${mediaId}`).subscribe((m) => {
        this.media.set([{ id: m.id, url: m.url, mimeType: m.mimeType }]);
        if (m.mimeType.startsWith('video/') && !this.isVideo()) this.contentType.set('video');
      });
    }
    const date = q.get('date');
    if (date) this.scheduleAt = toLocalInput(new Date(date));
    const caption = q.get('caption');
    if (caption) this.caption.set(caption);
  }

  // ------------------------------------------------------------------ editing helpers

  supports(p: Platform): boolean {
    return p !== 'youtube' || this.isVideo();
  }

  setType(t: ContentType) {
    this.contentType.set(t);
    const isVideo = t === 'video' || t === 'reel';
    this.media.update((list) => list.filter((m) => m.mimeType.startsWith('video/') === isVideo).slice(0, t === 'carousel' ? 10 : 1));
    if (!isVideo) {
      const yt = this.accounts().filter((a) => a.platform === 'youtube').map((a) => a.id);
      this.selected.update((s) => new Set([...s].filter((id) => !yt.includes(id))));
    }
  }

  toggleAccount(a: SocialAccount) {
    if (a.status !== 'connected' || !this.supports(a.platform)) return;
    const next = new Set(this.selected());
    next.has(a.id) ? next.delete(a.id) : next.add(a.id);
    this.selected.set(next);
  }

  override(accountId: string): Override {
    return this.overrides()[accountId] ?? { captionOverride: '', hashtagsOverride: null, titleOverride: '', options: {} };
  }

  setOverride(accountId: string, patch: Partial<Override>) {
    this.overrides.update((o) => ({ ...o, [accountId]: { ...this.override(accountId), ...patch } }));
  }

  setOption(accountId: string, key: keyof PostPlatformOptions, value: unknown) {
    this.setOverride(accountId, { options: { ...this.override(accountId).options, [key]: value } });
  }

  addHashtags(raw: string) {
    const tags = raw.split(/[\s,]+/).map((t) => t.replace(/^#+/, '').trim()).filter(Boolean);
    this.hashtags.update((list) => [...new Set([...list, ...tags])]);
    this.hashtagInput = '';
  }

  removeHashtag(tag: string) {
    this.hashtags.update((list) => list.filter((t) => t !== tag));
  }

  addMention(raw: string) {
    const m = raw.replace(/^@+/, '').trim();
    if (m) this.mentions.update((list) => [...new Set([...list, m])]);
    this.mentionInput = '';
  }

  onPicked(items: Media[]) {
    if (this.picker() === 'thumbnail') {
      const img = items.find((m) => m.mimeType.startsWith('image/'));
      if (img) this.thumbnail.set({ id: img.id, url: img.url, mimeType: img.mimeType });
    } else {
      const wantVideo = this.isVideo();
      const valid = items.filter((m) => m.mimeType.startsWith('video/') === wantVideo);
      if (valid.length < items.length) this.toast.warning(`Only ${wantVideo ? 'videos' : 'images'} can be used for a ${this.contentType()} post`);
      const merged = [...this.media(), ...valid.map((m) => ({ id: m.id, url: m.url, mimeType: m.mimeType }))];
      const unique = merged.filter((m, i) => merged.findIndex((x) => x.id === m.id) === i);
      if (unique.length > 1 && this.contentType() === 'image') this.contentType.set('carousel');
      this.media.set(this.contentType() === 'carousel' ? unique.slice(0, 10) : unique.slice(-1));
    }
    this.picker.set(null);
  }

  onAiImage(m: Media) {
    this.aiImage.set(false);
    this.onPicked([m]);
  }

  removeMedia(id: string) {
    this.media.update((list) => list.filter((m) => m.id !== id));
  }

  moveMedia(index: number, delta: number) {
    const list = [...this.media()];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target]!, list[index]!];
    this.media.set(list);
  }

  updateScript(key: 'hook' | 'mainContent' | 'cta' | 'ending', value: string) {
    this.reel.update((r) => ({ ...r, script: { ...(r.script ?? { hook: '', mainContent: '', cta: '', ending: '' }), [key]: value } }));
  }

  addOverlay() {
    this.reel.update((r) => ({ ...r, textOverlays: [...(r.textOverlays ?? []), { text: '', startSeconds: 0, endSeconds: 3, position: 'center' }] }));
  }

  updateOverlay(i: number, patch: Partial<TextOverlay>) {
    this.reel.update((r) => ({ ...r, textOverlays: (r.textOverlays ?? []).map((o, idx) => (idx === i ? { ...o, ...patch } : o)) }));
  }

  removeOverlay(i: number) {
    this.reel.update((r) => ({ ...r, textOverlays: (r.textOverlays ?? []).filter((_, idx) => idx !== i) }));
  }

  patchReel(patch: Partial<ReelData>) {
    this.reel.update((r) => ({ ...r, ...patch }));
  }

  // ------------------------------------------------------------------ AI

  private briefBody() {
    const b = Object.fromEntries(Object.entries(this.brief).filter(([, v]) => v));
    return { brandId: this.brands.currentBrandId(), contentType: this.contentType(), topic: this.brief.topic || this.title || undefined, ...b };
  }

  generateCaptions() {
    this.busy.set('ai-caption');
    this.api.post<AiResult<{ captions: { hook: string; text: string }[] }>>('/ai/caption', { ...this.briefBody(), variants: 3 }).subscribe({
      next: (r) => {
        this.aiCaptions.set(r.result.captions);
        this.busy.set(null);
      },
      error: (e) => this.fail(e),
    });
  }

  generateHashtags() {
    this.busy.set('ai-hashtags');
    this.api.post<AiResult<{ hashtags: string[] }>>('/ai/hashtags', { ...this.briefBody(), caption: this.caption() || undefined, count: 15 }).subscribe({
      next: (r) => {
        this.hashtags.update((list) => [...new Set([...list, ...r.result.hashtags])]);
        this.busy.set(null);
        this.toast.success(`${r.result.hashtags.length} hashtags added`);
      },
      error: (e) => this.fail(e),
    });
  }

  optimisePerPlatform() {
    const platforms = this.selectedPlatforms();
    if (!platforms.length) return this.toast.warning('Select at least one platform first');
    this.busy.set('ai-platform');
    this.api
      .post<AiResult<Partial<Record<Platform, { caption: string; hashtags: string[]; title?: string }>>>>('/ai/platform-content', {
        ...this.briefBody(),
        platforms,
        baseCaption: this.caption() || undefined,
      })
      .subscribe({
        next: (r) => {
          for (const a of this.selectedAccounts()) {
            const v = r.result[a.platform];
            if (v) this.setOverride(a.id, { captionOverride: v.caption, hashtagsOverride: v.hashtags, titleOverride: v.title ?? this.override(a.id).titleOverride });
          }
          this.showOverrides.set(true);
          this.busy.set(null);
          this.toast.success('Platform-specific versions generated');
        },
        error: (e) => this.fail(e),
      });
  }

  generateReelScript() {
    this.busy.set('ai-reel');
    const duration = this.reel().durationSeconds ?? 30;
    this.api
      .post<AiResult<{ hook: string; mainContent: string; cta: string; ending: string; voiceOver: string; durationSeconds: number; textOverlays: TextOverlay[]; caption: string; hashtags: string[] }>>(
        '/ai/reel-script',
        { ...this.briefBody(), durationSeconds: duration },
      )
      .subscribe({
        next: (r) => {
          const s = r.result;
          this.reel.update((x) => ({ ...x, script: { hook: s.hook, mainContent: s.mainContent, cta: s.cta, ending: s.ending }, textOverlays: s.textOverlays, voiceOverText: s.voiceOver, durationSeconds: s.durationSeconds ?? duration }));
          if (!this.caption()) this.caption.set(s.caption);
          if (!this.hashtags().length) this.hashtags.set(s.hashtags);
          this.busy.set(null);
          this.toast.success('Reel script generated');
        },
        error: (e) => this.fail(e),
      });
  }

  useCaption(text: string) {
    this.caption.set(text);
    this.aiCaptions.set([]);
    this.aiPanel.set(null);
  }

  // ------------------------------------------------------------------ save / schedule / publish

  private payload(includeBrand: boolean) {
    const isReel = this.contentType() === 'reel';
    return {
      ...(includeBrand ? { brandId: this.brands.currentBrandId() } : {}),
      contentType: this.contentType(),
      title: this.title || undefined,
      caption: this.caption() || undefined,
      hashtags: this.hashtags(),
      mentions: this.mentions(),
      cta: this.cta() || undefined,
      linkUrl: this.linkUrl() || undefined,
      videoTitle: this.isVideo() ? this.videoTitle() || undefined : undefined,
      videoDescription: this.isVideo() ? this.videoDescription || undefined : undefined,
      thumbnailMediaId: this.isVideo() ? this.thumbnail()?.id : undefined,
      mediaIds: this.media().map((m) => m.id),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      platforms: [...this.selected()].map((socialAccountId) => {
        const o = this.override(socialAccountId);
        return {
          socialAccountId,
          captionOverride: o.captionOverride || undefined,
          hashtagsOverride: o.hashtagsOverride ?? undefined,
          titleOverride: o.titleOverride || undefined,
          options: Object.keys(o.options).length ? o.options : undefined,
        };
      }),
      reel: isReel
        ? {
            script: this.reel().script?.hook || this.reel().script?.mainContent ? this.reel().script : undefined,
            textOverlays: (this.reel().textOverlays ?? []).filter((o) => o.text),
            voiceOverEnabled: !!this.reel().voiceOverEnabled,
            voiceOverText: this.reel().voiceOverText || undefined,
            subtitlesEnabled: !!this.reel().subtitlesEnabled,
            musicPreference: this.reel().musicPreference || undefined,
            durationSeconds: this.reel().durationSeconds || undefined,
          }
        : undefined,
    };
  }

  /** Creates or updates the post and returns its id. */
  private persist(): Observable<string> {
    if (!this.brands.currentBrandId()) {
      this.toast.warning('Create a brand first');
      return of('');
    }
    const existing = this.post();
    if (existing && this.locked()) return of(existing.id);
    const req = existing ? this.api.patch<Post>(`/posts/${existing.id}`, this.payload(false)) : this.api.post<Post>('/posts', this.payload(true));
    return req.pipe(
      switchMap((p) => {
        this.post.set(p);
        // Update the URL without re-creating the editor (keeps publishing state on screen).
        if (!existing) this.location.replaceState(`/posts/${p.id}`);
        return of(p.id);
      }),
    );
  }

  saveDraft() {
    this.busy.set('save');
    this.persist().subscribe({
      next: (id) => {
        this.busy.set(null);
        if (id) this.toast.success('Draft saved');
      },
      error: (e) => this.fail(e),
    });
  }

  schedule() {
    if (!this.selected().size) return this.toast.warning('Select at least one platform');
    const when = new Date(this.scheduleAt);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000) return this.toast.warning('Pick a time at least 1 minute in the future');
    this.busy.set('schedule');
    this.persist()
      .pipe(switchMap((id) => this.api.post<Post>(`/posts/${id}/schedule`, { scheduledAt: when.toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })))
      .subscribe({
        next: (p) => {
          this.post.set(p);
          this.busy.set(null);
          this.toast.success(`Scheduled for ${when.toLocaleString()}`);
        },
        error: (e) => this.fail(e),
      });
  }

  unschedule() {
    const p = this.post();
    if (!p) return;
    this.api.delete<Post>(`/posts/${p.id}/schedule`).subscribe({ next: (u) => { this.post.set(u); this.toast.info('Schedule cancelled'); }, error: (e) => this.toast.error(e) });
  }

  /** Publish Now: the platforms currently ticked. */
  publishNow() {
    if (!this.selected().size) return this.toast.warning('Select at least one platform');
    this.busy.set('publish');
    this.persist()
      .pipe(switchMap((id) => this.api.post<PublishBatch>(`/posts/${id}/publish`, { targets: [...this.selected()] })))
      .subscribe({ next: (b) => this.afterPublish(b), error: (e) => this.fail(e) });
  }

  /** Publish to All: every connected account of the brand that supports this content. */
  publishToAll() {
    const all = this.connected().filter((a) => this.supports(a.platform)).map((a) => a.id);
    if (!all.length) return this.toast.warning('Connect at least one social account for this brand');
    this.selected.set(new Set(all));
    this.busy.set('publish-all');
    this.persist()
      .pipe(switchMap((id) => this.api.post<PublishBatch>(`/posts/${id}/publish-all`)))
      .subscribe({ next: (b) => this.afterPublish(b), error: (e) => this.fail(e) });
  }

  private afterPublish(batch: PublishBatch) {
    this.busy.set(null);
    const queued = batch.jobs.filter((j) => j.status === 'pending').length;
    if (queued) this.toast.info(`Publishing to ${queued} platform(s)…`);
    for (const s of batch.skipped) this.toast.error(`${this.meta[s.platform]?.name}: ${s.reason}`);
    this.refreshStatus();
  }

  refreshStatus() {
    const p = this.post();
    if (!p) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.api.get<{ status: Post['status']; platforms: PlatformStatus[] }>(`/posts/${p.id}/publishing-status`).subscribe((r) => {
      this.status.set(r.platforms);
      this.post.update((x) => (x ? { ...x, status: r.status } : x));
      if (this.publishing()) this.pollTimer = setTimeout(() => this.refreshStatus(), 3000);
    });
  }

  retryJob(s: PlatformStatus) {
    if (!s.latestJobId) return;
    this.api.post<PublishBatch>(`/publishing/${s.latestJobId}/retry`).subscribe({ next: (b) => this.afterPublish(b), error: (e) => this.toast.error(e) });
  }

  retryFailed() {
    const p = this.post();
    if (!p) return;
    this.api.post<PublishBatch>(`/posts/${p.id}/retry-failed`).subscribe({ next: (b) => this.afterPublish(b), error: (e) => this.toast.error(e) });
  }

  showJob(s: PlatformStatus) {
    if (s.latestJobId) this.api.get<PublishingJob>(`/publishing/jobs/${s.latestJobId}`).subscribe((j) => this.jobDetail.set(j));
  }

  remove() {
    const p = this.post();
    if (!p || !confirm('Delete this post?')) return;
    this.api.delete(`/posts/${p.id}`).subscribe({ next: () => void this.router.navigate(['/posts']), error: (e) => this.toast.error(e) });
  }

  duplicate() {
    const p = this.post();
    if (!p) return;
    this.api.post<Post>(`/posts/${p.id}/duplicate`).subscribe({ next: (d) => void this.router.navigate(['/posts', d.id]), error: (e) => this.toast.error(e) });
  }

  private fail(e: unknown) {
    this.busy.set(null);
    this.toast.error(e);
  }
}
