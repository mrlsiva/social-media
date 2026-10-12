import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Platform } from '../core/models';

export const PLATFORM_META: Record<string, { name: string; color: string }> = {
  instagram: { name: 'Instagram', color: '#E1306C' },
  facebook: { name: 'Facebook', color: '#1877F2' },
  youtube: { name: 'YouTube', color: '#FF0000' },
  linkedin: { name: 'LinkedIn', color: '#0A66C2' },
  x: { name: 'X', color: '#111111' },
  tiktok: { name: 'TikTok', color: '#111111' },
  pinterest: { name: 'Pinterest', color: '#E60023' },
  threads: { name: 'Threads', color: '#111111' },
};

/** Simplified glyphs (white on the platform colour) used to identify each network. */
const GLYPHS: Record<string, string> = {
  instagram: '<rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" stroke-width="2"/><circle cx="16.3" cy="7.7" r="1" fill="#fff"/>',
  facebook: '<path fill="#fff" d="M13.4 20v-6.3h2.1l.3-2.5h-2.4V9.6c0-.7.2-1.2 1.2-1.2h1.3V6.2a17 17 0 0 0-1.9-.1c-1.9 0-3.2 1.2-3.2 3.3v1.8H8.7v2.5h2.1V20h2.6Z"/>',
  youtube: '<path fill="#fff" d="M10 8.8v6.4l5.6-3.2L10 8.8Z"/>',
  linkedin: '<path fill="#fff" d="M7.2 9.6h2.3V17H7.2V9.6Zm1.2-3.7a1.3 1.3 0 1 1 0 2.7 1.3 1.3 0 0 1 0-2.7ZM11 9.6h2.2v1c.3-.6 1.1-1.2 2.2-1.2 2.4 0 2.8 1.6 2.8 3.6V17H16v-3.6c0-.9 0-2-1.2-2s-1.4.9-1.4 1.9V17H11V9.6Z"/>',
  x: '<path fill="#fff" d="M7 6.5h2.7l2.6 3.6 3-3.6H17l-3.9 4.6 4.2 5.9h-2.7l-2.8-3.9-3.3 3.9H6.8l4.3-5L7 6.5Z"/>',
  tiktok: '<path fill="#fff" d="M14.6 6c.3 1.4 1.3 2.4 2.7 2.5v2.2a5 5 0 0 1-2.7-.8v4a3.6 3.6 0 1 1-3.6-3.6h.4v2.2h-.4a1.4 1.4 0 1 0 1.4 1.4V6h2.2Z"/>',
  pinterest: '<path fill="#fff" d="M12.2 6C8.6 6 7 8.5 7 10.5c0 1.2.5 2.3 1.4 2.7.2.1.3 0 .4-.2l.1-.6c.1-.2 0-.3-.1-.5-.3-.3-.5-.8-.5-1.4 0-1.9 1.4-3.5 3.6-3.5 2 0 3.1 1.2 3.1 2.8 0 2.1-.9 3.9-2.3 3.9-.8 0-1.3-.6-1.2-1.4.2-.9.6-1.9.6-2.6 0-.6-.3-1.1-1-1.1-.8 0-1.4.8-1.4 1.9 0 .7.2 1.2.2 1.2l-1 4c-.3 1.2 0 2.6 0 2.7h.2c.1-.1 1-1.3 1.3-2.4l.5-1.9c.3.5 1 .9 1.8.9 2.3 0 3.9-2.1 3.9-5C17.2 7.9 15.2 6 12.2 6Z"/>',
  threads: '<path fill="none" stroke="#fff" stroke-width="1.8" d="M15.5 11.3c-.6-2.2-2.7-2.6-4-2.1-1.5.6-1.7 2.7-.4 3.3 1.8.8 4.7.1 4.5-2.6-.2-3-3-4.4-5.6-3.6C7.3 7.1 6.4 9.7 6.6 12c.3 3.3 2.8 5.2 5.6 5 2.4-.2 4.1-1.8 4.1-3.6"/>',
};

@Component({
  selector: 'app-platform-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="pi" [style.width.px]="size()" [style.height.px]="size()" [style.background]="color()" [title]="label()">
    <svg viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()" [innerHTML]="glyph()"></svg></span>`,
  styles: [`:host { display: inline-flex; } .pi { display: inline-grid; place-items: center; border-radius: 30%; overflow: hidden; flex-shrink: 0; }`],
})
export class PlatformIcon {
  private readonly sanitizer = inject(DomSanitizer);
  readonly platform = input.required<Platform | string>();
  readonly size = input(22);
  protected readonly color = computed(() => PLATFORM_META[this.platform()]?.color ?? '#7c8aa0');
  protected readonly label = computed(() => PLATFORM_META[this.platform()]?.name ?? this.platform());
  protected readonly glyph = computed<SafeHtml>(() => this.sanitizer.bypassSecurityTrustHtml(GLYPHS[this.platform()] ?? ''));
}
