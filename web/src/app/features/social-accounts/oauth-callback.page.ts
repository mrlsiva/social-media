import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { PLATFORM_META, PlatformIcon } from '../../shared/platform';

interface DiscoveredAccount {
  key: string;
  accountName: string;
  accountType: string;
  username: string | null;
  profileImageUrl: string | null;
  alreadyConnected: boolean;
}

interface OAuthSession {
  sessionId: string;
  platform: string;
  accounts: DiscoveredAccount[];
}

/** Return page after the provider's OAuth consent: choose which pages/channels to connect. */
@Component({
  selector: 'app-oauth-callback-page',
  imports: [RouterLink, Icon, PlatformIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page" style="max-width:720px">
      @if (error()) {
        <div class="card card-body">
          <div class="alert alert-danger"><app-icon name="alert" /> <span>{{ error() }}</span></div>
          <a class="btn mt-16" routerLink="/social-accounts">Back to social accounts</a>
        </div>
      } @else if (!session()) {
        <div class="card card-body row"><span class="spinner lg"></span> <span>Finishing connection...</span></div>
      } @else {
        <div class="card">
          <div class="card-header">
            <app-platform-icon [platform]="session()!.platform" [size]="32" />
            <h2>Choose {{ meta[session()!.platform]?.name }} accounts to connect</h2>
          </div>
          <div class="card-body stack">
            @for (a of session()!.accounts; track a.key) {
              <label class="pick">
                <input type="checkbox" [checked]="selected().has(a.key)" (change)="toggle(a.key)" />
                <span class="avatar">@if (a.profileImageUrl) { <img [src]="a.profileImageUrl" alt="" /> } @else { {{ a.accountName[0] }} }</span>
                <span style="flex:1"><b>{{ a.accountName }}</b><br /><span class="muted small">{{ a.username ? '@' + a.username + ' · ' : '' }}{{ a.accountType.replace('_', ' ') }}</span></span>
                @if (a.alreadyConnected) { <span class="badge badge-info">Already connected - will refresh</span> }
              </label>
            } @empty {
              <div class="alert alert-warning"><app-icon name="alert" />
                <span>No eligible accounts were found. For Instagram, make sure the account is a Professional account linked to a Facebook Page you manage, and that you granted all requested permissions.</span></div>
            }
          </div>
          <div class="card-footer">
            <a class="btn" routerLink="/social-accounts">Cancel</a>
            <button class="btn btn-primary" type="button" [disabled]="selected().size === 0 || saving()" (click)="complete()">
              @if (saving()) { <span class="spinner"></span> } Connect {{ selected().size }} account(s)
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`.pick { display: flex; gap: 12px; align-items: center; padding: 12px; border: 1px solid var(--border); border-radius: 12px; cursor: pointer; } .pick:hover { background: var(--surface-2); } .pick input { width: 18px; height: 18px; accent-color: var(--primary); }`],
})
export class OAuthCallbackPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly meta = PLATFORM_META;
  protected readonly session = signal<OAuthSession | null>(null);
  protected readonly selected = signal(new Set<string>());
  protected readonly error = signal('');
  protected readonly saving = signal(false);

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    if (q.get('status') !== 'success' || !q.get('session')) {
      this.error.set(q.get('message') ?? 'The connection was not completed.');
      return;
    }
    this.api.get<OAuthSession>(`/social-accounts/oauth-sessions/${q.get('session')}`).subscribe({
      next: (s) => {
        this.session.set(s);
        this.selected.set(new Set(s.accounts.map((a) => a.key)));
      },
      error: (e: Error) => this.error.set(e.message),
    });
  }

  toggle(key: string) {
    const next = new Set(this.selected());
    next.has(key) ? next.delete(key) : next.add(key);
    this.selected.set(next);
  }

  complete() {
    this.saving.set(true);
    this.api.post(`/social-accounts/oauth-sessions/${this.session()!.sessionId}/complete`, { accountKeys: [...this.selected()] }).subscribe({
      next: () => {
        this.toast.success('Account(s) connected');
        void this.router.navigate(['/social-accounts']);
      },
      error: (e) => {
        this.toast.error(e);
        this.saving.set(false);
      },
    });
  }
}
