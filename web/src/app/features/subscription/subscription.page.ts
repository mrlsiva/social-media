import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { CurrentSubscription, Plan, UsageSnapshot } from '../../core/models';
import { Icon } from '../../shared/icon';

const LABELS: Record<string, string> = {
  brands: 'Brands',
  social_accounts: 'Social accounts',
  team_members: 'Team members',
  scheduled_posts: 'Scheduled posts',
  storage_mb: 'Storage (MB)',
  ai_generations: 'AI generations / month',
  ai_caption: 'AI text / month',
  ai_hashtags: 'AI hashtags / month',
  ai_image: 'AI images / month',
  ai_video: 'AI videos / month',
};

@Component({
  selector: 'app-subscription-page',
  imports: [Icon, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header"><div><h1>Subscription</h1><p>Plan limits are configured in the database by your administrator.</p></div></div>

      @if (current(); as c) {
        <div class="card">
          <div class="card-header"><h2>Current plan: {{ c.plan?.name ?? 'None' }}</h2><span class="badge badge-success">{{ c.subscription?.status ?? 'active' }}</span></div>
          <div class="card-body usage">
            @for (u of shown(c.usage); track u.metric) {
              <div class="meter">
                <div class="row"><span style="flex:1">{{ label(u.metric) }}</span><b>{{ u.used }}</b><span class="muted">/ {{ u.unlimited ? '∞' : u.limit }}</span></div>
                <div class="bar"><span [style.width.%]="pct(u)" [class.warn]="pct(u) >= 80" [class.full]="pct(u) >= 100"></span></div>
              </div>
            }
          </div>
        </div>
      }

      <h2 class="mt-24 mb-16">Plans</h2>
      <div class="plans">
        @for (p of plans(); track p.id) {
          <div class="card plan" [class.current]="p.code === current()?.plan?.code" [class.featured]="p.code === 'business'">
            @if (p.code === 'business') { <span class="ribbon">Most popular</span> }
            <h3>{{ p.name }}</h3>
            <p class="text-2 small">{{ p.description }}</p>
            <div class="price">@if (p.code === 'enterprise') { <b>Custom</b> } @else { <b>{{ p.priceMonthly | currency: p.currency : 'symbol' : '1.0-0' }}</b><span>/month</span> }</div>
            <ul>@for (f of p.features ?? []; track f) { <li><app-icon name="check" [size]="15" /> {{ f }}</li> }</ul>
            @if (p.code === current()?.plan?.code) { <button class="btn btn-block" type="button" disabled>Current plan</button> }
            @else { <button class="btn btn-block" type="button" disabled title="Plans are assigned by your administrator">Ask your administrator to switch</button> }
          </div>
        }
      </div>
      <p class="hint mt-16">Online payments are not enabled in this build. Admins can assign plans via <span class="kbd">POST /api/v1/subscriptions/admin/assign</span> (designed to be called by a Stripe/Razorpay webhook).</p>
    </div>
  `,
  styles: [`
    .usage { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px 24px; }
    .meter { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
    .bar { height: 8px; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--primary); border-radius: 999px; }
    .bar span.warn { background: var(--warning); } .bar span.full { background: var(--danger); }
    .plans { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
    .plan { padding: 22px; display: flex; flex-direction: column; gap: 10px; position: relative; }
    .plan.current { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-100); }
    .plan.featured { border-color: var(--secondary); }
    .ribbon { position: absolute; top: 14px; right: 14px; background: var(--secondary); color: #fff; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px; }
    .price b { font-size: 30px; letter-spacing: -0.02em; } .price span { color: var(--muted); }
    ul { list-style: none; padding: 0; margin: 0 0 8px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
    li { display: flex; gap: 8px; align-items: center; font-size: 13px; } li app-icon { color: var(--success); }
  `],
})
export class SubscriptionPage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly current = signal<CurrentSubscription | null>(null);
  protected readonly plans = signal<Plan[]>([]);

  ngOnInit(): void {
    this.api.get<CurrentSubscription>('/subscriptions/current').subscribe((c) => this.current.set(c));
    this.api.get<Plan[]>('/subscriptions/plans').subscribe((p) => this.plans.set(p));
  }

  shown(usage: UsageSnapshot[]) {
    return usage.filter((u) => ['brands', 'social_accounts', 'team_members', 'scheduled_posts', 'storage_mb', 'ai_generations', 'ai_image', 'ai_video'].includes(u.metric));
  }

  label(metric: string) {
    return LABELS[metric] ?? metric;
  }

  pct(u: UsageSnapshot) {
    if (u.unlimited) return 0;
    if (u.limit <= 0) return u.used > 0 ? 100 : 0;
    return Math.min(100, Math.round((u.used / u.limit) * 100));
  }
}
