import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { BrandContextService } from '../../core/brand-context.service';
import { PageMeta, Post } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { PlatformIcon } from '../../shared/platform';
import { StatusBadge } from '../../shared/status-badge';

const TITLES: Record<string, string> = { scheduled: 'Scheduled posts', published: 'Published posts', draft: 'Drafts', failed: 'Failed posts' };

@Component({
  selector: 'app-posts-list-page',
  imports: [FormsModule, RouterLink, Icon, PlatformIcon, StatusBadge, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <div><h1>{{ heading() }}</h1><p>{{ brands.currentBrand()?.name }} · {{ meta()?.total ?? 0 }} post(s)</p></div>
        <div class="row">
          <a class="btn" routerLink="/reels/new"><app-icon name="film" /> New reel</a>
          <a class="btn btn-primary" routerLink="/posts/new"><app-icon name="plus" /> New post</a>
        </div>
      </div>

      <div class="card">
        <div class="filters">
          <div class="tabs">
            @for (t of tabs; track t.value) {
              <button type="button" [class.active]="(status() ?? '') === t.value" (click)="setStatus(t.value)">{{ t.label }}</button>
            }
          </div>
          <div class="row" style="padding:10px 16px">
            <input class="input" style="max-width:260px" placeholder="Search caption or title" [(ngModel)]="search" (keydown.enter)="load(1)" />
            <select class="select" style="max-width:160px" [(ngModel)]="contentType" (ngModelChange)="load(1)">
              <option value="">All types</option><option value="image">Image</option><option value="carousel">Carousel</option><option value="video">Video</option><option value="reel">Reel</option>
            </select>
            <select class="select" style="max-width:160px" [(ngModel)]="platform" (ngModelChange)="load(1)">
              <option value="">All platforms</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="youtube">YouTube</option><option value="linkedin">LinkedIn</option>
            </select>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Post</th><th>Type</th><th>Platforms</th><th>Status</th><th>{{ status() === 'published' ? 'Published' : 'Scheduled / updated' }}</th><th></th></tr></thead>
            <tbody>
              @for (p of posts(); track p.id) {
                <tr class="clickable" (click)="open(p)">
                  <td>
                    <div class="row">
                      <div class="thumb">
                        @if (p.media[0]; as m) {
                          @if (m.mimeType.startsWith('video/')) { <video [src]="m.url" muted></video> } @else { <img [src]="m.url" alt="" /> }
                        } @else { <app-icon name="edit" [size]="16" /> }
                      </div>
                      <div style="min-width:0"><b class="truncate block">{{ p.title || 'Untitled' }}</b><span class="muted small truncate block">{{ p.caption }}</span></div>
                    </div>
                  </td>
                  <td><span class="badge">{{ p.contentType }}</span></td>
                  <td><div class="row" style="gap:4px">
                    @for (pp of p.platforms; track pp.id) { <span [class.dim]="pp.status === 'failed'" [title]="pp.platform + ': ' + pp.status"><app-platform-icon [platform]="pp.platform" [size]="22" /></span> }
                  </div></td>
                  <td><app-status-badge [status]="p.status" /></td>
                  <td class="small">{{ (p.publishedAt || p.scheduledAt || p.updatedAt) | date: 'd MMM y, h:mm a' }}</td>
                  <td (click)="$event.stopPropagation()">
                    <div class="row" style="gap:2px">
                      <button class="btn btn-ghost btn-icon btn-sm" type="button" title="Duplicate" (click)="duplicate(p)"><app-icon name="copy" [size]="15" /></button>
                      <button class="btn btn-ghost btn-icon btn-sm" type="button" title="Delete" (click)="remove(p)"><app-icon name="trash" [size]="15" /></button>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6"><div class="empty"><div class="empty-icon"><app-icon name="layers" /></div><h3>No posts here yet</h3>
                  <a class="btn btn-primary mt-16" routerLink="/posts/new">Create a post</a></div></td></tr>
              }
            </tbody>
          </table>
        </div>
        @if (meta(); as m) {
          @if (m.totalPages > 1) {
            <div class="card-footer">
              <span class="muted small" style="margin-right:auto">Page {{ m.page }} of {{ m.totalPages }}</span>
              <button class="btn btn-sm" type="button" [disabled]="m.page <= 1" (click)="load(m.page - 1)">Previous</button>
              <button class="btn btn-sm" type="button" [disabled]="m.page >= m.totalPages" (click)="load(m.page + 1)">Next</button>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    .thumb { width: 44px; height: 44px; border-radius: 10px; overflow: hidden; background: var(--surface-2); display: grid; place-items: center; color: var(--muted); flex-shrink: 0; }
    .thumb img, .thumb video { width: 100%; height: 100%; object-fit: cover; }
    .block { display: block; max-width: 380px; }
    .clickable { cursor: pointer; } .clickable:hover td { background: var(--surface-2); }
    .dim { opacity: .4; }
  `],
})
export class PostsListPage {
  readonly status = input<string>();
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly brands = inject(BrandContextService);
  protected readonly posts = signal<Post[]>([]);
  protected readonly meta = signal<PageMeta | null>(null);
  protected search = '';
  protected contentType = '';
  protected platform = '';
  protected readonly tabs = [
    { value: '', label: 'All' }, { value: 'draft', label: 'Drafts' }, { value: 'scheduled', label: 'Scheduled' },
    { value: 'published', label: 'Published' }, { value: 'partially_published', label: 'Partial' }, { value: 'failed', label: 'Failed' },
  ];
  protected readonly heading = computed(() => TITLES[this.status() ?? ''] ?? 'All posts');

  constructor() {
    effect(() => {
      this.status();
      if (this.brands.currentBrandId()) this.load(1);
    });
  }

  setStatus(value: string) {
    void this.router.navigate(['/posts'], { queryParams: value ? { status: value } : {} });
  }

  load(page: number) {
    const brandId = this.brands.currentBrandId();
    if (!brandId) return;
    this.api
      .list<Post>('/posts', {
        brandId, page, limit: 20, status: this.status() || undefined, search: this.search || undefined,
        contentType: this.contentType || undefined, platform: this.platform || undefined,
        order: this.status() === 'scheduled' ? 'ASC' : 'DESC',
      })
      .subscribe({ next: (r) => { this.posts.set(r.items); this.meta.set(r.meta); }, error: (e) => this.toast.error(e) });
  }

  open(p: Post) {
    void this.router.navigate(['/posts', p.id]);
  }

  duplicate(p: Post) {
    this.api.post<Post>(`/posts/${p.id}/duplicate`).subscribe({ next: (d) => void this.router.navigate(['/posts', d.id]), error: (e) => this.toast.error(e) });
  }

  remove(p: Post) {
    if (!confirm('Delete this post?')) return;
    this.api.delete(`/posts/${p.id}`).subscribe({ next: () => this.load(this.meta()?.page ?? 1), error: (e) => this.toast.error(e) });
  }
}
