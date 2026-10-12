import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { BrandContextService } from '../../core/brand-context.service';
import { Media, MediaFolder, PageMeta } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { BytesPipe } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';

@Component({
  selector: 'app-media-page',
  imports: [FormsModule, Icon, Modal, BytesPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './media.page.html',
  styleUrl: './media.page.scss',
})
export class MediaPage {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly brands = inject(BrandContextService);

  protected readonly items = signal<Media[]>([]);
  protected readonly meta = signal<PageMeta | null>(null);
  protected readonly folders = signal<MediaFolder[]>([]);
  protected readonly loading = signal(false);
  protected readonly uploading = signal(0);
  protected readonly dragOver = signal(false);
  protected readonly preview = signal<Media | null>(null);

  protected readonly folderId = signal<string>(''); // '' = all, 'root' = unfiled
  protected readonly type = signal('');
  protected readonly source = signal('');
  protected readonly search = signal('');
  protected newFolder = '';
  protected editName = '';
  protected editFolder = '';

  constructor() {
    effect(() => {
      const brandId = this.brands.currentBrandId();
      // read filter signals so the effect re-runs when they change
      this.folderId(); this.type(); this.source(); this.search();
      if (brandId) this.load(brandId, 1);
    });
    effect(() => {
      const brandId = this.brands.currentBrandId();
      if (brandId) this.loadFolders(brandId);
    });
  }

  load(brandId: string, page: number) {
    this.loading.set(true);
    this.api
      .list<Media>(`/brands/${brandId}/media`, {
        page,
        limit: 40,
        folderId: this.folderId() || undefined,
        type: this.type() || undefined,
        source: this.source() || undefined,
        search: this.search() || undefined,
      })
      .subscribe({
        next: (r) => {
          this.items.set(page === 1 ? r.items : [...this.items(), ...r.items]);
          this.meta.set(r.meta);
          this.loading.set(false);
        },
        error: (e) => {
          this.toast.error(e);
          this.loading.set(false);
        },
      });
  }

  loadMore() {
    const m = this.meta();
    const brandId = this.brands.currentBrandId();
    if (m && brandId && m.page < m.totalPages) this.load(brandId, m.page + 1);
  }

  loadFolders(brandId: string) {
    this.api.get<MediaFolder[]>(`/brands/${brandId}/media-folders`).subscribe((f) => this.folders.set(f));
  }

  onFiles(files: FileList | File[] | null) {
    const brandId = this.brands.currentBrandId();
    if (!files || !brandId) return;
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('file', file);
      if (this.folderId() && this.folderId() !== 'root') form.append('folderId', this.folderId());
      this.uploading.update((n) => n + 1);
      this.api.upload<Media>(`/brands/${brandId}/media`, form).subscribe({
        next: (m) => {
          this.items.update((list) => [m, ...list]);
          this.toast.success(`${file.name} uploaded`);
        },
        error: (e) => this.toast.error(`${file.name}: ${(e as Error).message}`),
        complete: () => this.uploading.update((n) => n - 1),
      });
    }
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragOver.set(false);
    this.onFiles(event.dataTransfer?.files ?? null);
  }

  createFolder() {
    const brandId = this.brands.currentBrandId();
    if (!brandId || !this.newFolder.trim()) return;
    this.api.post(`/brands/${brandId}/media-folders`, { name: this.newFolder.trim() }).subscribe({
      next: () => {
        this.newFolder = '';
        this.loadFolders(brandId);
      },
      error: (e) => this.toast.error(e),
    });
  }

  deleteFolder(f: MediaFolder) {
    if (!confirm(`Delete folder "${f.name}"? Its media will move to "Unfiled".`)) return;
    this.api.delete(`/media-folders/${f.id}`).subscribe(() => {
      if (this.folderId() === f.id) this.folderId.set('');
      this.loadFolders(this.brands.currentBrandId()!);
    });
  }

  open(m: Media) {
    this.preview.set(m);
    this.editName = m.name;
    this.editFolder = m.folderId ?? '';
  }

  saveMedia() {
    const m = this.preview();
    if (!m) return;
    this.api.patch<Media>(`/media/${m.id}`, { name: this.editName, folderId: this.editFolder || null }).subscribe({
      next: (updated) => {
        this.items.update((list) => list.map((x) => (x.id === m.id ? updated : x)));
        this.preview.set(null);
        this.toast.success('Saved');
        this.loadFolders(this.brands.currentBrandId()!);
      },
      error: (e) => this.toast.error(e),
    });
  }

  remove(m: Media) {
    if (!confirm(`Delete "${m.name}"?`)) return;
    this.api.delete(`/media/${m.id}`).subscribe({
      next: () => {
        this.items.update((list) => list.filter((x) => x.id !== m.id));
        this.preview.set(null);
      },
      error: (e) => this.toast.error(e),
    });
  }

  useInPost(m: Media) {
    void this.router.navigate([m.mimeType.startsWith('video/') ? '/reels/new' : '/posts/new'], { queryParams: { media: m.id } });
  }
}
