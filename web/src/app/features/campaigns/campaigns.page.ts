import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { BrandContextService } from '../../core/brand-context.service';
import { Campaign, Platform } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';
import { PLATFORM_META, PlatformIcon } from '../../shared/platform';
import { StatusBadge } from '../../shared/status-badge';

@Component({
  selector: 'app-campaigns-page',
  imports: [FormsModule, RouterLink, Icon, Modal, PlatformIcon, StatusBadge, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <div><h1>Campaigns</h1><p>Plan multi-day campaigns - AI drafts every day's post for you to review.</p></div>
        <button class="btn btn-primary" type="button" (click)="creating.set(true)"><app-icon name="plus" /> New campaign</button>
      </div>
      <div class="camp-grid">
        @for (c of campaigns(); track c.id) {
          <a class="card camp" [routerLink]="['/campaigns', c.id]">
            <div class="row"><span class="camp-icon"><app-icon name="megaphone" /></span><h2 style="flex:1" class="truncate">{{ c.name }}</h2><app-status-badge [status]="c.status" /></div>
            <p class="text-2 mt-8 truncate">{{ c.objective || c.description || 'No objective set' }}</p>
            <div class="row mt-16 small text-2"><app-icon name="calendar" [size]="15" /> {{ c.startDate | date: 'd MMM' }} – {{ c.endDate | date: 'd MMM y' }} · {{ c.durationDays }} days</div>
            <div class="row mt-8">
              @for (p of c.platforms; track p) { <app-platform-icon [platform]="p" [size]="22" /> }
              <span class="spacer"></span><span class="badge">{{ c.postCount ?? 0 }} posts</span>
            </div>
          </a>
        } @empty {
          <div class="card empty" style="grid-column:1/-1"><div class="empty-icon"><app-icon name="megaphone" /></div><h3>No campaigns yet</h3>
            <p>Example: "Diwali 2026" - 7 days on Instagram, Facebook, LinkedIn and YouTube.</p>
            <button class="btn btn-primary mt-16" type="button" (click)="creating.set(true)">Create campaign</button></div>
        }
      </div>
    </div>

    @if (creating()) {
      <app-modal title="New campaign" (closed)="creating.set(false)">
        <div class="stack">
          <div class="field"><label>Name *</label><input class="input" [(ngModel)]="form.name" placeholder="Diwali 2026" /></div>
          <div class="field"><label>Objective</label><input class="input" [(ngModel)]="form.objective" placeholder="Increase festive season sign-ups" /></div>
          <div class="grid grid-2">
            <div class="field"><label>Start date *</label><input class="input" type="date" [(ngModel)]="form.startDate" /></div>
            <div class="field"><label>Duration (days) *</label><input class="input" type="number" min="1" max="90" [(ngModel)]="form.durationDays" /></div>
          </div>
          <div class="field"><label>Platforms *</label><div class="row-wrap">
            @for (p of allPlatforms; track p) {
              <label class="checkbox"><input type="checkbox" [checked]="form.platforms.includes(p)" (change)="toggle(p)" /> <app-platform-icon [platform]="p" [size]="18" /> {{ meta[p].name }}</label>
            }</div></div>
          <div class="field"><label>Description</label><textarea class="textarea" [(ngModel)]="form.description"></textarea></div>
        </div>
        <div modal-footer class="modal-footer">
          <button class="btn" type="button" (click)="creating.set(false)">Cancel</button>
          <button class="btn btn-primary" type="button" [disabled]="!form.name || !form.startDate || !form.platforms.length" (click)="create()">Create</button>
        </div>
      </app-modal>
    }
  `,
  styles: [`
    .camp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
    .camp { padding: 18px; color: var(--text); text-decoration: none !important; transition: box-shadow .15s; }
    .camp:hover { box-shadow: var(--shadow); }
    .camp h2 { font-size: 16px; }
    .camp-icon { width: 36px; height: 36px; border-radius: 10px; background: var(--secondary-50); color: var(--secondary-600); display: grid; place-items: center; }
  `],
})
export class CampaignsPage {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly brands = inject(BrandContextService);
  protected readonly campaigns = signal<Campaign[]>([]);
  protected readonly creating = signal(false);
  protected readonly meta = PLATFORM_META;
  protected readonly allPlatforms: Platform[] = ['instagram', 'facebook', 'linkedin', 'youtube'];
  protected form = { name: '', objective: '', description: '', startDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), durationDays: 7, platforms: [...this.allPlatforms] };

  constructor() {
    effect(() => {
      const brandId = this.brands.currentBrandId();
      if (brandId) this.api.list<Campaign>('/campaigns', { brandId, page: 1, limit: 50 }).subscribe((r) => this.campaigns.set(r.items));
    });
  }

  toggle(p: Platform) {
    this.form.platforms = this.form.platforms.includes(p) ? this.form.platforms.filter((x) => x !== p) : [...this.form.platforms, p];
  }

  create() {
    this.api
      .post<Campaign>('/campaigns', {
        brandId: this.brands.currentBrandId(),
        name: this.form.name,
        objective: this.form.objective || undefined,
        description: this.form.description || undefined,
        startDate: this.form.startDate,
        durationDays: +this.form.durationDays,
        platforms: this.form.platforms,
      })
      .subscribe({ next: (c) => void this.router.navigate(['/campaigns', c.id]), error: (e) => this.toast.error(e) });
  }
}
