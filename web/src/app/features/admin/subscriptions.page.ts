import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { PageMeta, Plan } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

interface AccountRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  isActive: boolean;
  createdAt: string;
  status: string | null;
  since: string | null;
  source: string | null;
  planCode: string | null;
  planName: string | null;
  isDefaultPlan: boolean;
  aiUsage: Record<string, number>;
}

const USAGE_COLUMNS = [
  { metric: 'ai_image', label: 'Images' },
  { metric: 'ai_generations', label: 'AI text' },
  { metric: 'ai_video', label: 'Reels' },
];

@Component({
  selector: 'app-admin-subscriptions-page',
  imports: [FormsModule, Icon, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header"><div><h1>Subscriptions</h1>
        <p>Change any account's plan. It takes effect immediately - limits are checked on the next request.</p></div></div>

      <div class="card">
        <div class="card-header">
          <input class="input" style="max-width:320px" placeholder="Search by name or email" [(ngModel)]="search" (keyup.enter)="load(1)" />
          <button class="btn" type="button" (click)="load(1)"><app-icon name="search" [size]="16" /> Search</button>
          <span class="spacer"></span>
          <span class="muted small">{{ meta()?.total ?? 0 }} account(s)</span>
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr>
            <th>Account</th><th>Current plan</th>
            @for (c of usageColumns; track c.metric) { <th>{{ c.label }} this month</th> }
            <th>Change plan</th>
          </tr></thead>
          <tbody>
            @for (a of accounts(); track a.id) {
              <tr>
                <td>
                  <b>{{ a.firstName }} {{ a.lastName }}</b>
                  @if (a.id === auth.user()?.id) { <span class="badge badge-info">You</span> }
                  @if (!a.isActive) { <span class="badge badge-danger">Disabled</span> }
                  <div class="muted small">{{ a.email }}</div>
                  <div class="muted small">Joined {{ a.createdAt | date: 'd MMM y' }}</div>
                </td>
                <td>
                  <span class="badge" [class.badge-pink]="a.planCode === 'enterprise'" [class.badge-info]="a.planCode !== 'enterprise' && a.planCode !== defaultCode()">{{ a.planName ?? 'None' }}</span>
                  <div class="muted small">
                    @if (a.isDefaultPlan) { Default plan } @else if (a.since) { Since {{ a.since | date: 'd MMM y' }}{{ a.source === 'manual' ? ' · set by admin' : '' }} }
                  </div>
                </td>
                @for (c of usageColumns; track c.metric) {
                  <td class="small">{{ a.aiUsage[c.metric] ?? 0 }} / {{ limitLabel(a.planCode, c.metric) }}</td>
                }
                <td>
                  <div class="row">
                    <select class="select" style="min-width:150px" [(ngModel)]="selected[a.id]">
                      @for (p of plans(); track p.code) { <option [value]="p.code">{{ p.name }} ({{ priceLabel(p) }})</option> }
                    </select>
                    <button class="btn btn-sm btn-primary" type="button" [disabled]="!selected[a.id] || selected[a.id] === a.planCode || busy() === a.id" (click)="change(a)">
                      {{ busy() === a.id ? 'Saving...' : 'Apply' }}
                    </button>
                  </div>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="muted">No accounts found.</td></tr>
            }
          </tbody>
        </table></div>
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
})
export class AdminSubscriptionsPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  protected readonly accounts = signal<AccountRow[]>([]);
  protected readonly meta = signal<PageMeta | null>(null);
  protected readonly plans = signal<Plan[]>([]);
  protected readonly defaultCode = signal<string | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly usageColumns = USAGE_COLUMNS;
  protected search = '';
  protected selected: Record<string, string> = {};

  ngOnInit(): void {
    this.api.get<Plan[]>('/subscriptions/admin/plans').subscribe({
      next: (plans) => {
        this.plans.set(plans);
        this.defaultCode.set(plans.find((p) => p.isDefault)?.code ?? null);
      },
      error: (e) => this.toast.error(e),
    });
    this.load(1);
  }

  load(page: number) {
    this.api.list<AccountRow>('/subscriptions/admin/accounts', { page, limit: 20, search: this.search.trim() || undefined }).subscribe({
      next: ({ items, meta }) => {
        this.selected = Object.fromEntries(items.map((a) => [a.id, a.planCode ?? '']));
        this.accounts.set(items);
        this.meta.set(meta);
      },
      error: (e) => this.toast.error(e),
    });
  }

  protected change(a: AccountRow) {
    const plan = this.plans().find((p) => p.code === this.selected[a.id]);
    if (!plan || !confirm(`Change ${a.email} from ${a.planName ?? 'no plan'} to ${plan.name}?`)) return;
    this.busy.set(a.id);
    this.api.post('/subscriptions/admin/assign', { userId: a.id, planCode: plan.code, externalProvider: 'manual' }).subscribe({
      next: () => {
        this.busy.set(null);
        this.toast.success(`${a.email} is now on ${plan.name}`);
        this.load(this.meta()?.page ?? 1);
      },
      error: (e) => {
        this.busy.set(null);
        this.toast.error(e);
      },
    });
  }

  protected limitLabel(planCode: string | null, metric: string): string {
    const limit = this.plans().find((p) => p.code === planCode)?.limits.find((l) => l.metric === metric)?.limitValue;
    return limit === undefined ? '-' : limit < 0 ? 'Unlimited' : String(limit);
  }

  protected priceLabel(p: Plan): string {
    if (Number(p.priceMonthly) > 0) return `${p.currency} ${p.priceMonthly}/mo`;
    // A paid tier priced at 0 (e.g. Enterprise) is custom-priced, not free.
    return p.isDefault ? 'free' : 'custom';
  }
}
