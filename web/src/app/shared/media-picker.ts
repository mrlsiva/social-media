import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { Media } from '../core/models';
import { ToastService } from '../core/toast.service';
import { Icon } from './icon';
import { Modal } from './modal';

/** Brand media library picker with inline upload. */
@Component({
  selector: 'app-media-picker',
  imports: [Modal, Icon, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [title]="'Choose from media library'" size="lg" (closed)="closed.emit()">
      <div class="row-wrap mb-16">
        <div class="segmented">
          <button type="button" [class.active]="type() === ''" (click)="setType('')">All</button>
          <button type="button" [class.active]="type() === 'image'" (click)="setType('image')">Images</button>
          <button type="button" [class.active]="type() === 'video'" (click)="setType('video')">Videos</button>
        </div>
        <input class="input" style="max-width:240px" placeholder="Search..." [ngModel]="search()" (ngModelChange)="search.set($event); load()" />
        <span class="spacer"></span>
        <label class="btn btn-primary">
          @if (uploading()) { <span class="spinner"></span> } @else { <app-icon name="upload" /> }
          Upload
          <input type="file" hidden multiple accept=".jpg,.jpeg,.png,.webp,.mp4,.mov" (change)="upload($event)" />
        </label>
      </div>
      @if (loading()) {
        <div class="picker-grid">@for (i of [1,2,3,4,5,6,7,8]; track i) { <div class="skeleton" style="aspect-ratio:1"></div> }</div>
      } @else if (items().length === 0) {
        <div class="empty"><div class="empty-icon"><app-icon name="image" /></div><h3>No media yet</h3><p>Upload images or videos to use them in posts.</p></div>
      } @else {
        <div class="picker-grid">
          @for (m of items(); track m.id) {
            <button type="button" class="tile" [class.selected]="isSelected(m)" (click)="toggle(m)">
              @if (m.mimeType.startsWith('video/')) {
                <video [src]="m.url" muted preload="metadata"></video><span class="kind"><app-icon name="video" [size]="14" /></span>
              } @else {
                <img [src]="m.url" [alt]="m.name" loading="lazy" />
              }
              @if (isSelected(m)) { <span class="check"><app-icon name="check" [size]="14" /></span> }
              <span class="name truncate">{{ m.name }}</span>
            </button>
          }
        </div>
      }
      <div modal-footer class="modal-footer">
        <span class="muted small" style="margin-right:auto">{{ selected().length }} selected</span>
        <button class="btn" type="button" (click)="closed.emit()">Cancel</button>
        <button class="btn btn-primary" type="button" [disabled]="selected().length === 0" (click)="picked.emit(selected())">Use selected</button>
      </div>
    </app-modal>
  `,
  styles: [`
    .picker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
    .tile { position: relative; border: 2px solid var(--border); border-radius: 12px; padding: 0; overflow: hidden; background: var(--surface-2); cursor: pointer; aspect-ratio: 1; }
    .tile img, .tile video { width: 100%; height: 100%; object-fit: cover; }
    .tile.selected { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-100); }
    .check { position: absolute; top: 8px; right: 8px; background: var(--primary); color: #fff; border-radius: 50%; width: 22px; height: 22px; display: grid; place-items: center; }
    .kind { position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,.6); color: #fff; border-radius: 6px; padding: 3px; }
    .name { position: absolute; left: 0; right: 0; bottom: 0; padding: 4px 8px; font-size: 11px; color: #fff; background: linear-gradient(transparent, rgba(0,0,0,.65)); text-align: left; }
  `],
})
export class MediaPicker implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly brandId = input.required<string>();
  readonly multiple = input(true);
  readonly accept = input<'' | 'image' | 'video'>('');
  readonly picked = output<Media[]>();
  readonly closed = output<void>();

  protected readonly items = signal<Media[]>([]);
  protected readonly selected = signal<Media[]>([]);
  protected readonly loading = signal(true);
  protected readonly uploading = signal(false);
  protected readonly type = signal<'' | 'image' | 'video'>('');
  protected readonly search = signal('');

  ngOnInit(): void {
    this.type.set(this.accept());
    this.load();
  }

  setType(t: '' | 'image' | 'video') {
    this.type.set(t);
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api
      .list<Media>(`/brands/${this.brandId()}/media`, { page: 1, limit: 60, type: this.type() || undefined, search: this.search() || undefined })
      .subscribe({
        next: (r) => {
          this.items.set(r.items.filter((m) => m.type !== 'audio'));
          this.loading.set(false);
        },
        error: (e) => {
          this.toast.error(e);
          this.loading.set(false);
        },
      });
  }

  isSelected(m: Media) {
    return this.selected().some((s) => s.id === m.id);
  }

  toggle(m: Media) {
    if (!this.multiple()) return this.selected.set([m]);
    this.selected.update((list) => (this.isSelected(m) ? list.filter((s) => s.id !== m.id) : [...list, m]));
  }

  upload(event: Event) {
    const files = Array.from((event.target as HTMLInputElement).files ?? []);
    if (!files.length) return;
    this.uploading.set(true);
    let pending = files.length;
    for (const file of files) {
      const form = new FormData();
      form.append('file', file);
      this.api.upload<Media>(`/brands/${this.brandId()}/media`, form).subscribe({
        next: (m) => {
          this.items.update((list) => [m, ...list]);
          this.toggle(m);
        },
        error: (e) => this.toast.error(`${file.name}: ${(e as Error).message}`),
        complete: () => {
          if (--pending === 0) this.uploading.set(false);
        },
      });
    }
    (event.target as HTMLInputElement).value = '';
  }
}
