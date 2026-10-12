import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { BrandContextService } from '../../core/brand-context.service';
import { AnalyticsOverview, Dashboard } from '../../core/models';
import { ChartComponent } from '../../shared/chart';
import { CompactNumberPipe, TimeAgoPipe } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { PlatformIcon } from '../../shared/platform';
import { StatusBadge } from '../../shared/status-badge';

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, Icon, PlatformIcon, StatusBadge, ChartComponent, CompactNumberPipe, TimeAgoPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  protected readonly brands = inject(BrandContextService);
  protected readonly data = signal<Dashboard | null>(null);
  protected readonly analytics = signal<AnalyticsOverview | null>(null);
  protected readonly scope = signal<'brand' | 'all'>('brand');

  protected readonly greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();

  protected readonly stats = computed(() => {
    const c = this.data()?.counts;
    if (!c) return [];
    return [
      { label: 'Total brands', value: c.brands, icon: 'brands', tone: '' },
      { label: 'Total posts', value: c.posts, icon: 'layers', tone: '' },
      { label: 'Scheduled', value: c.scheduled, icon: 'clock', tone: 'amber' },
      { label: 'Published', value: c.published, icon: 'check', tone: 'green' },
      { label: 'Failed', value: c.failed, icon: 'alert', tone: 'red' },
      { label: 'AI generations (month)', value: c.aiGenerations, icon: 'sparkles', tone: 'pink' },
      { label: 'Connected accounts', value: c.connectedAccounts, icon: 'link', tone: '' },
      { label: 'Engagement (30d)', value: c.engagement, icon: 'heart', tone: 'pink' },
      { label: 'Reach (30d)', value: c.reach, icon: 'eye', tone: 'green' },
    ];
  });

  protected readonly chart = computed<ChartConfiguration>(() => {
    const daily = this.analytics()?.daily ?? [];
    return {
      type: 'line',
      data: {
        labels: daily.map((d) => d.date.slice(5)),
        datasets: [
          { label: 'Reach', data: daily.map((d) => d.reach), borderColor: '#0078B8', backgroundColor: 'rgba(0,120,184,.12)', fill: true, tension: 0.35, pointRadius: 0 },
          { label: 'Engagement', data: daily.map((d) => d.engagement), borderColor: '#F57AA8', backgroundColor: 'rgba(245,122,168,.08)', fill: true, tension: 0.35, pointRadius: 0 },
        ],
      },
      options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, grid: { color: '#eef2f7' } }, x: { grid: { display: false } } } },
    };
  });

  constructor() {
    effect(() => {
      const brandId = this.scope() === 'brand' ? this.brands.currentBrandId() : null;
      if (this.scope() === 'brand' && !brandId && !this.brands.loaded()) return;
      const params = brandId ? { brandId } : {};
      this.api.get<Dashboard>('/dashboard', params).subscribe((d) => this.data.set(d));
      this.api.get<AnalyticsOverview>('/analytics', params).subscribe((a) => this.analytics.set(a));
    });
  }
}
