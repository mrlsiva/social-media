import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { ApiService } from '../../core/api.service';
import { BrandContextService } from '../../core/brand-context.service';
import { AnalyticsOverview } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ChartComponent } from '../../shared/chart';
import { CompactNumberPipe } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { PLATFORM_META, PlatformIcon } from '../../shared/platform';

const grid = { color: '#eef2f7' };

@Component({
  selector: 'app-analytics-page',
  imports: [FormsModule, RouterLink, Icon, PlatformIcon, ChartComponent, CompactNumberPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <div><h1>Analytics</h1><p>{{ scope() === 'brand' ? brands.currentBrand()?.name : 'All brands' }} · {{ data()?.range?.from }} → {{ data()?.range?.to }}</p></div>
        <div class="row-wrap">
          <div class="segmented">
            <button type="button" [class.active]="scope() === 'brand'" (click)="scope.set('brand')">Brand</button>
            <button type="button" [class.active]="scope() === 'all'" (click)="scope.set('all')">All brands</button>
          </div>
          <select class="select" style="width:150px" [ngModel]="days()" (ngModelChange)="days.set(+$event)">
            <option [ngValue]="7">Last 7 days</option><option [ngValue]="30">Last 30 days</option><option [ngValue]="90">Last 90 days</option>
          </select>
          <select class="select" style="width:150px" [ngModel]="platform()" (ngModelChange)="platform.set($event)">
            <option value="">All platforms</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="youtube">YouTube</option><option value="linkedin">LinkedIn</option>
          </select>
          <button class="btn" type="button" [disabled]="scope() !== 'brand'" (click)="sync()"><app-icon name="refresh" [size]="15" /> Sync now</button>
        </div>
      </div>

      @if (data(); as d) {
        <div class="kpis">
          @for (k of kpis(); track k.label) {
            <div class="card stat"><div class="stat-icon {{ k.tone }}"><app-icon [name]="k.icon" /></div>
              <div><div class="stat-label">{{ k.label }}</div><div class="stat-value">{{ k.suffix ? k.value : (k.value | compact) }}{{ k.suffix }}</div></div></div>
          }
        </div>

        @if (d.summary.reach + d.summary.engagement + d.summary.followers === 0) {
          <div class="alert alert-info mt-16"><app-icon name="info" /><span>No metrics yet. Insights are pulled from each platform's official API every 6 hours for posts published through this app (and on "Sync now"). Some metrics (e.g. reach) require business accounts and insights permissions.</span></div>
        }

        <div class="grid grid-2 mt-16">
          <div class="card"><div class="card-header"><h3>Daily reach</h3></div><div class="card-body"><app-chart [config]="reachChart()" /></div></div>
          <div class="card"><div class="card-header"><h3>Engagement</h3></div><div class="card-body"><app-chart [config]="engagementChart()" /></div></div>
          <div class="card"><div class="card-header"><h3>Followers</h3></div><div class="card-body"><app-chart [config]="followersChart()" /></div></div>
          <div class="card"><div class="card-header"><h3>Platform comparison</h3></div><div class="card-body"><app-chart [config]="platformChart()" /></div></div>
        </div>

        <div class="grid grid-2 mt-16">
          <div class="card">
            <div class="card-header"><h3>By platform</h3></div>
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Platform</th><th>Posts</th><th>Reach</th><th>Engagement</th><th>Rate</th><th>Followers</th></tr></thead>
              <tbody>
                @for (p of d.platforms; track p.platform) {
                  <tr><td><div class="row"><app-platform-icon [platform]="p.platform" [size]="20" /> {{ meta[p.platform].name }}</div></td>
                    <td>{{ p.posts }}</td><td>{{ p.reach | compact }}</td><td>{{ p.engagement | compact }}</td><td>{{ p.engagementRate }}%</td><td>{{ p.followers | compact }}</td></tr>
                } @empty { <tr><td colspan="6" class="muted">No data</td></tr> }
              </tbody></table></div>
          </div>
          <div class="card">
            <div class="card-header"><h3>Best-performing content</h3></div>
            <div class="list">
              @for (t of d.topPosts; track t.postId; let i = $index) {
                <a class="top" [routerLink]="['/posts', t.postId]">
                  <span class="rank">{{ i + 1 }}</span>
                  <span class="truncate" style="flex:1">{{ t.title || 'Untitled' }}</span>
                  @for (p of t.platforms; track p) { <app-platform-icon [platform]="p" [size]="16" /> }
                  <span class="small"><b>{{ t.engagement | compact }}</b> eng · {{ t.reach | compact }} reach</span>
                </a>
              } @empty { <div class="empty small">No published content with metrics yet.</div> }
            </div>
          </div>
        </div>
      } @else {
        <div class="skeleton" style="height:400px"></div>
      }
    </div>
  `,
  styles: [`
    .kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
    .list { padding: 6px; }
    .top { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 10px; color: var(--text); text-decoration: none !important; }
    .top:hover { background: var(--surface-2); }
    .rank { width: 24px; height: 24px; border-radius: 50%; background: var(--primary-50); color: var(--primary); display: grid; place-items: center; font-weight: 700; font-size: 12px; }
  `],
})
export class AnalyticsPage {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly brands = inject(BrandContextService);
  protected readonly meta = PLATFORM_META;
  protected readonly data = signal<AnalyticsOverview | null>(null);
  protected readonly scope = signal<'brand' | 'all'>('brand');
  protected readonly days = signal(30);
  protected readonly platform = signal('');

  protected readonly kpis = computed(() => {
    const s = this.data()?.summary;
    if (!s) return [];
    return [
      { label: 'Impressions', value: s.impressions, icon: 'eye', tone: '', suffix: '' },
      { label: 'Reach', value: s.reach, icon: 'users', tone: 'green', suffix: '' },
      { label: 'Likes', value: s.likes, icon: 'heart', tone: 'pink', suffix: '' },
      { label: 'Comments', value: s.comments, icon: 'message', tone: '', suffix: '' },
      { label: 'Shares', value: s.shares, icon: 'share', tone: 'amber', suffix: '' },
      { label: 'Saves', value: s.saves, icon: 'bookmark', tone: '', suffix: '' },
      { label: 'Followers', value: s.followers, icon: 'user', tone: 'green', suffix: '' },
      { label: 'Engagement rate', value: s.engagementRate, icon: 'zap', tone: 'pink', suffix: '%' },
      { label: 'Video views', value: s.videoViews, icon: 'play', tone: 'red', suffix: '' },
    ];
  });

  protected readonly reachChart = computed<ChartConfiguration>(() => {
    const d = this.data()?.daily ?? [];
    return {
      type: 'line',
      data: { labels: d.map((x) => x.date.slice(5)), datasets: [{ label: 'Reach', data: d.map((x) => x.reach), borderColor: '#0078B8', backgroundColor: 'rgba(0,120,184,.12)', fill: true, tension: 0.35, pointRadius: 0 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid }, x: { grid: { display: false } } } },
    };
  });

  protected readonly engagementChart = computed<ChartConfiguration>(() => {
    const d = this.data()?.daily ?? [];
    return {
      type: 'bar',
      data: { labels: d.map((x) => x.date.slice(5)), datasets: [{ label: 'Engagement', data: d.map((x) => x.engagement), backgroundColor: '#F57AA8', borderRadius: 4 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid }, x: { grid: { display: false } } } },
    };
  });

  protected readonly followersChart = computed<ChartConfiguration>(() => {
    const d = this.data()?.followers ?? [];
    return {
      type: 'line',
      data: { labels: d.map((x) => x.date.slice(5)), datasets: [{ label: 'Followers', data: d.map((x) => x.followers), borderColor: '#12a150', backgroundColor: 'rgba(18,161,80,.1)', fill: true, tension: 0.3, pointRadius: 2 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { grid }, x: { grid: { display: false } } } },
    };
  });

  protected readonly platformChart = computed<ChartConfiguration>(() => {
    const p = this.data()?.platforms ?? [];
    return {
      type: 'bar',
      data: {
        labels: p.map((x) => PLATFORM_META[x.platform]?.name ?? x.platform),
        datasets: [
          { label: 'Reach', data: p.map((x) => x.reach), backgroundColor: '#0078B8', borderRadius: 4 },
          { label: 'Engagement', data: p.map((x) => x.engagement), backgroundColor: '#F57AA8', borderRadius: 4 },
        ],
      },
      options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, grid }, x: { grid: { display: false } } } },
    };
  });

  constructor() {
    effect(() => {
      const brandId = this.scope() === 'brand' ? this.brands.currentBrandId() : undefined;
      if (this.scope() === 'brand' && !brandId) return;
      const to = new Date();
      const from = new Date(Date.now() - (this.days() - 1) * 86_400_000);
      this.api
        .get<AnalyticsOverview>('/analytics', { brandId, platform: this.platform() || undefined, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) })
        .subscribe({ next: (d) => this.data.set(d), error: (e) => this.toast.error(e) });
    });
  }

  sync() {
    const brandId = this.brands.currentBrandId();
    if (!brandId) return;
    this.api.post(`/brands/${brandId}/analytics/sync`).subscribe({
      next: () => this.toast.info('Sync queued - metrics will update shortly'),
      error: (e) => this.toast.error(e),
    });
  }
}
