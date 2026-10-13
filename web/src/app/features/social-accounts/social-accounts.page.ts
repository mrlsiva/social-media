import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { BrandContextService } from '../../core/brand-context.service';
import { Platform, PlatformInfo, SocialAccount } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { PLATFORM_META, PlatformIcon } from '../../shared/platform';
import { StatusBadge } from '../../shared/status-badge';
import { PlatformSetupGuide } from './platform-setup-guide';

const NOTES: Partial<Record<Platform, string>> = {
  instagram: 'Requires an Instagram Professional (Business/Creator) account linked to a Facebook Page.',
  facebook: 'Connect the Facebook Pages you manage. Posts are published as the Page.',
  youtube: 'Uploads go to your channel. Unverified API projects can only upload private videos until audited by YouTube.',
  linkedin: 'Posts to your member profile; company pages need LinkedIn Community Management API approval.',
};

@Component({
  selector: 'app-social-accounts-page',
  imports: [Icon, PlatformIcon, StatusBadge, DatePipe, PlatformSetupGuide],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <div><h1>Social accounts</h1><p>Connections for <b>{{ brands.currentBrand()?.name ?? '...' }}</b>. We use official OAuth - we never see or store your passwords.</p></div>
      </div>

      <div class="platform-grid">
        @for (p of supported(); track p.platform) {
          <div class="card platform-card">
            <div class="card-body">
              <div class="row">
                <app-platform-icon [platform]="p.platform" [size]="40" />
                <div style="flex:1">
                  <h2>{{ p.name }}</h2>
                  <span class="small" [class.ok]="connectedCount(p.platform) > 0" [class.warn]="connectedCount(p.platform) === 0">
                    {{ connectedCount(p.platform) > 0 ? '✅ Connected (' + connectedCount(p.platform) + ')' : '⚠️ Not connected' }}
                  </span>
                </div>
                <button class="btn btn-ghost btn-icon btn-sm guide-btn" type="button" [title]="(isAdmin() ? 'How to set up ' : 'How to connect ') + p.name"
                  [attr.aria-label]="(isAdmin() ? 'How to set up ' : 'How to connect ') + p.name" (click)="guideFor.set(p)"><app-icon name="info" [size]="18" /></button>
                <button class="btn btn-sm" [class.btn-primary]="connectedCount(p.platform) === 0" type="button"
                  [disabled]="!p.configured || connecting() === p.platform" (click)="connect(p.platform)"
                  [title]="p.configured ? '' : isAdmin() ? 'Add the OAuth app credentials in the backend .env first' : 'Not available yet. Contact your administrator.'">
                  @if (connecting() === p.platform) { <span class="spinner"></span> } @else { <app-icon name="link" [size]="15" /> }
                  {{ connectedCount(p.platform) ? 'Add another' : 'Connect' }}
                </button>
              </div>
              <p class="note">{{ notes[p.platform] }}</p>
              @if (!p.configured) {
                <div class="alert alert-warning mt-8"><app-icon name="alert" [size]="16" />
                  @if (isAdmin()) {
                    <span>Not configured on the server. Set the {{ p.platform === 'youtube' ? 'GOOGLE_*' : p.platform === 'linkedin' ? 'LINKEDIN_*' : 'META_*' }} variables in the backend .env.
                      <button class="link-btn" type="button" (click)="guideFor.set(p)">View setup guide</button></span>
                  } @else {
                    <span>{{ p.name }} isn't available yet. Contact your administrator to enable it.</span>
                  }
                </div>
              }
              @for (a of byPlatform()[p.platform] ?? []; track a.id) {
                <div class="account">
                  <span class="avatar">@if (a.profileImageUrl) { <img [src]="a.profileImageUrl" alt="" /> } @else { {{ a.accountName[0] }} }</span>
                  <div class="acc-info">
                    <b class="truncate">{{ a.accountName }}</b>
                    <span class="muted small">{{ a.username ? '@' + a.username + ' · ' : '' }}{{ a.accountType.replace('_', ' ') }}
                      @if (a.tokenExpiresAt) { · token expires {{ a.tokenExpiresAt | date: 'd MMM y' }} }</span>
                    @if (a.statusMessage && a.status !== 'connected') { <span class="error-text">{{ a.statusMessage }}</span> }
                  </div>
                  <app-status-badge [status]="a.status" />
                  <button class="btn btn-ghost btn-icon btn-sm" type="button" title="Check connection" (click)="validate(a)"><app-icon name="refresh" [size]="15" /></button>
                  @if (a.status !== 'connected') {
                    <button class="btn btn-sm btn-primary" type="button" (click)="connect(a.platform)">Reconnect</button>
                  }
                  <button class="btn btn-ghost btn-icon btn-sm danger" type="button" title="Disconnect" (click)="disconnect(a)"><app-icon name="trash" [size]="15" /></button>
                </div>
              }
            </div>
          </div>
        }
      </div>

      @if (planned().length) {
        <h3 class="mt-24 mb-8 text-2">Coming soon</h3>
        <div class="row-wrap">
          @for (p of planned(); track p.platform) { <span class="chip"><app-platform-icon [platform]="p.platform" [size]="18" /> {{ p.name }}</span> }
        </div>
      }
    </div>

    @if (guideFor(); as g) {
      <app-platform-setup-guide [platform]="g" (closed)="guideFor.set(null)" />
    }
  `,
  styles: [`
    .platform-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 16px; }
    .platform-card h2 { font-size: 16px; }
    .ok { color: var(--success); font-weight: 600; } .warn { color: var(--warning); font-weight: 600; }
    .note { color: var(--text-2); font-size: 12.5px; margin-top: 10px; }
    .account { display: flex; gap: 10px; align-items: center; padding: 10px; margin-top: 10px; border: 1px solid var(--border); border-radius: 12px; }
    .acc-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .danger { color: var(--danger); }
    .guide-btn { color: var(--text-2); }
    .link-btn { border: 0; background: none; padding: 0; color: inherit; font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }
    @media (max-width: 520px) { .platform-grid { grid-template-columns: 1fr; } }
  `],
})
export class SocialAccountsPage {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly brands = inject(BrandContextService);
  protected readonly isAdmin = inject(AuthService).isAdmin;
  protected readonly platforms = signal<PlatformInfo[]>([]);
  protected readonly accounts = signal<SocialAccount[]>([]);
  protected readonly connecting = signal<Platform | null>(null);
  protected readonly guideFor = signal<PlatformInfo | null>(null);
  protected readonly notes = NOTES;
  protected readonly meta = PLATFORM_META;

  protected readonly supported = computed(() => this.platforms().filter((p) => p.supported));
  protected readonly planned = computed(() => this.platforms().filter((p) => !p.supported));
  protected readonly byPlatform = computed(() => {
    const map: Partial<Record<Platform, SocialAccount[]>> = {};
    for (const a of this.accounts()) (map[a.platform] ??= []).push(a);
    return map;
  });

  constructor() {
    this.api.get<PlatformInfo[]>('/social-accounts/platforms').subscribe((p) => this.platforms.set(p));
    effect(() => {
      const brandId = this.brands.currentBrandId();
      if (brandId) this.load(brandId);
    });
  }

  connectedCount(p: Platform) {
    return (this.byPlatform()[p] ?? []).filter((a) => a.status === 'connected').length;
  }

  load(brandId: string) {
    this.api.list<SocialAccount>('/social-accounts', { brandId, page: 1, limit: 100 }).subscribe((r) => this.accounts.set(r.items));
  }

  connect(platform: Platform) {
    const brandId = this.brands.currentBrandId();
    if (!brandId) return this.toast.warning('Create a brand first');
    this.connecting.set(platform);
    const returnUrl = `${location.origin}/social-accounts/callback`;
    this.api.post<{ authorizationUrl: string }>(`/social-accounts/${platform}/connect`, { brandId, returnUrl }).subscribe({
      next: (r) => (location.href = r.authorizationUrl),
      error: (e) => {
        this.toast.error(e);
        this.connecting.set(null);
      },
    });
  }

  validate(a: SocialAccount) {
    this.api.post<SocialAccount>(`/social-accounts/${a.id}/validate`).subscribe({
      next: (updated) => {
        this.accounts.update((list) => list.map((x) => (x.id === a.id ? updated : x)));
        updated.status === 'connected' ? this.toast.success('Connection is healthy') : this.toast.warning(updated.statusMessage ?? 'Connection needs attention');
      },
      error: (e) => this.toast.error(e),
    });
  }

  disconnect(a: SocialAccount) {
    if (!confirm(`Disconnect ${a.accountName}? Stored tokens will be deleted.`)) return;
    this.api.delete(`/social-accounts/${a.id}`).subscribe({
      next: () => {
        this.accounts.update((list) => list.filter((x) => x.id !== a.id));
        this.toast.success('Disconnected');
      },
      error: (e) => this.toast.error(e),
    });
  }
}
