import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { BrandContextService } from '../../core/brand-context.service';
import { Brand, SocialAccount } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { initials } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { PlatformIcon } from '../../shared/platform';

@Component({
  selector: 'app-brands-page',
  imports: [RouterLink, Icon, PlatformIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <div><h1>Brands</h1><p>Each brand has its own accounts, media, content, analytics and AI voice.</p></div>
        <a class="btn btn-primary" routerLink="/brands/new"><app-icon name="plus" /> Add brand</a>
      </div>

      <div class="brand-grid">
        @for (b of ctx.brands(); track b.id) {
          <div class="card brand-card" [class.current]="b.id === ctx.currentBrandId()">
            <div class="cover" [style.background]="'linear-gradient(135deg,' + b.primaryColor + ',' + b.secondaryColor + ')'"></div>
            <div class="card-body">
              <div class="head">
                <span class="brand-logo lg" [style.background]="b.primaryColor">
                  @if (b.logoUrl) { <img [src]="b.logoUrl" [alt]="b.name" /> } @else { {{ initials(b.name) }} }
                </span>
                <div class="title">
                  <h2 class="truncate">{{ b.name }}</h2>
                  <span class="muted small truncate">{{ b.website || 'No website' }}</span>
                </div>
                <span class="badge">{{ b.role }}</span>
              </div>
              <p class="desc text-2">{{ b.description || 'No description yet.' }}</p>
              <div class="accounts">
                @for (a of accounts()[b.id] ?? []; track a.id) {
                  <span class="acc" [class.bad]="a.status !== 'connected'" [title]="a.accountName + ' - ' + a.status"><app-platform-icon [platform]="a.platform" [size]="22" /></span>
                } @empty { <span class="muted small">No social accounts connected</span> }
              </div>
            </div>
            <div class="actions">
              <button class="btn btn-primary btn-sm" type="button" (click)="open(b)">Open</button>
              <a class="btn btn-sm" [routerLink]="['/brands', b.id, 'edit']"><app-icon name="edit" [size]="15" /> Edit</a>
              <button class="btn btn-sm" type="button" (click)="go(b, '/social-accounts')"><app-icon name="link" [size]="15" /> Social</button>
              <button class="btn btn-sm" type="button" (click)="go(b, '/media')"><app-icon name="image" [size]="15" /> Media</button>
              <button class="btn btn-sm" type="button" (click)="go(b, '/analytics')"><app-icon name="chart" [size]="15" /> Analytics</button>
              @if (b.role === 'owner') {
                <button class="btn btn-sm btn-ghost btn-icon danger" type="button" (click)="remove(b)" title="Delete brand"><app-icon name="trash" [size]="15" /></button>
              }
            </div>
          </div>
        } @empty {
          <div class="card empty" style="grid-column:1/-1">
            <div class="empty-icon"><app-icon name="brands" /></div>
            <h3>No brands yet</h3>
            <p>Add your first business - e.g. Sling Groups, Sling Billings or Crackers.</p>
            <a class="btn btn-primary mt-16" routerLink="/brands/new"><app-icon name="plus" /> Add brand</a>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .brand-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 16px; }
    .brand-card { overflow: hidden; display: flex; flex-direction: column; }
    .brand-card.current { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-100); }
    .cover { height: 56px; }
    .head { display: flex; gap: 12px; align-items: flex-end; margin-top: -40px; }
    .brand-logo.lg { width: 60px; height: 60px; border-radius: 16px; border: 3px solid #fff; font-size: 20px; box-shadow: var(--shadow-sm); }
    .title { flex: 1; min-width: 0; display: flex; flex-direction: column; padding-bottom: 2px; }
    .desc { margin-top: 12px; min-height: 42px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .accounts { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; min-height: 24px; align-items: center; }
    .acc.bad { opacity: .35; }
    .actions { margin-top: auto; padding: 12px 16px; border-top: 1px solid var(--border); display: flex; gap: 6px; flex-wrap: wrap; }
    .danger { color: var(--danger); margin-left: auto; }
  `],
})
export class BrandsPage implements OnInit {
  protected readonly ctx = inject(BrandContextService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly accounts = signal<Record<string, SocialAccount[]>>({});
  protected readonly initials = initials;

  ngOnInit(): void {
    this.ctx.reload().subscribe();
    this.api.list<SocialAccount>('/social-accounts', { page: 1, limit: 100 }).subscribe((r) => {
      const grouped: Record<string, SocialAccount[]> = {};
      for (const a of r.items) (grouped[a.brandId] ??= []).push(a);
      this.accounts.set(grouped);
    });
  }

  open(b: Brand) {
    this.ctx.select(b.id);
    void this.router.navigate(['/dashboard']);
  }

  go(b: Brand, path: string) {
    this.ctx.select(b.id);
    void this.router.navigate([path]);
  }

  remove(b: Brand) {
    if (!confirm(`Delete "${b.name}"? Its posts, media and connections will no longer be accessible.`)) return;
    this.api.delete(`/brands/${b.id}`).subscribe({
      next: () => {
        this.ctx.remove(b.id);
        this.toast.success(`${b.name} deleted`);
      },
      error: (e) => this.toast.error(e),
    });
  }
}
