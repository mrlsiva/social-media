import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Campaign } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { PlatformIcon } from '../../shared/platform';
import { StatusBadge } from '../../shared/status-badge';

@Component({
  selector: 'app-campaign-detail-page',
  imports: [FormsModule, RouterLink, Icon, PlatformIcon, StatusBadge, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (campaign(); as c) {
      <div class="page">
        <div class="page-header">
          <div>
            <a routerLink="/campaigns" class="small"><app-icon name="chevron-left" [size]="14" /> Campaigns</a>
            <div class="row mt-8"><h1>{{ c.name }}</h1><app-status-badge [status]="c.status" /></div>
            <p>{{ c.startDate | date: 'd MMM' }} – {{ c.endDate | date: 'd MMM y' }} · {{ c.durationDays }} days · {{ c.objective }}</p>
          </div>
          <div class="row">
            <button class="btn btn-danger btn-sm" type="button" (click)="remove()"><app-icon name="trash" [size]="15" /></button>
            <button class="btn btn-primary" type="button" [disabled]="!c.posts?.length || busy()" (click)="scheduleAll()"><app-icon name="clock" /> Schedule all</button>
          </div>
        </div>

        <div class="layout">
          <div class="card card-body stack brief">
            <h3>AI campaign plan</h3>
            <p class="text-2 small">AI creates one draft post per day ({{ c.platforms.join(', ') }}), with platform-specific captions. Nothing is published until you schedule.</p>
            <div class="field"><label>Topic / theme</label><input class="input" [(ngModel)]="brief.topic" [placeholder]="c.name" /></div>
            <div class="field"><label>Product / service</label><input class="input" [(ngModel)]="brief.productService" /></div>
            <div class="field"><label>Target audience</label><input class="input" [(ngModel)]="brief.targetAudience" /></div>
            <div class="field"><label>Offer</label><input class="input" [(ngModel)]="brief.offer" placeholder="Flat 30% off till Diwali" /></div>
            <div class="grid grid-2">
              <div class="field"><label>Language</label><input class="input" [(ngModel)]="brief.language" placeholder="en" /></div>
              <div class="field"><label>Daily time</label><input class="input" type="time" [(ngModel)]="brief.postingTime" /></div>
            </div>
            <div class="field"><label>Extra instructions</label><textarea class="textarea" [(ngModel)]="brief.additionalInstructions"></textarea></div>
            <button class="btn btn-gradient" type="button" [disabled]="busy()" (click)="generate()">
              @if (busy()) { <span class="spinner"></span> Planning… } @else { <app-icon name="sparkles" /> {{ c.posts?.length ? 'Regenerate drafts' : 'Generate plan' }} }
            </button>
            @if (c.posts?.length) { <p class="hint">Regenerating replaces drafts that haven't been scheduled yet.</p> }
          </div>

          <div class="stack">
            @for (item of c.posts ?? []; track item.post.id) {
              <div class="card day">
                <div class="day-num"><span>Day</span><b>{{ item.dayNumber }}</b></div>
                <div class="day-body">
                  <div class="row"><b style="flex:1">{{ item.theme }}</b><span class="badge">{{ item.post.contentType }}</span><app-status-badge [status]="item.post.status" /></div>
                  <p class="caption text-2">{{ item.post.caption }}</p>
                  @if (planPrompt(item.dayNumber); as prompt) { <p class="small muted"><app-icon name="image" [size]="13" /> Visual idea: {{ prompt }}</p> }
                  <div class="row mt-8">
                    @for (pp of item.post.platforms; track pp.id) { <app-platform-icon [platform]="pp.platform" [size]="20" /> }
                    @if (!item.post.media.length) { <span class="badge badge-warning">needs media</span> }
                    <span class="spacer"></span>
                    <span class="small muted">{{ item.post.scheduledAt | date: 'EEE d MMM, h:mm a' }}</span>
                    <a class="btn btn-sm" [routerLink]="['/posts', item.post.id]"><app-icon name="edit" [size]="14" /> Review & edit</a>
                  </div>
                </div>
              </div>
            } @empty {
              <div class="card empty"><div class="empty-icon"><app-icon name="sparkles" /></div><h3>No posts yet</h3><p>Generate the plan with AI, or add posts to this campaign from the editor.</p></div>
            }
            @if (scheduleResults().length) {
              <div class="card card-body">
                <h3 class="mb-8">Scheduling results</h3>
                @for (r of scheduleResults(); track r.postId) {
                  <div class="row small"><b>Day {{ r.dayNumber }}</b> @if (r.scheduled) { <span class="badge badge-success">scheduled</span> } @else { <span class="badge badge-danger">skipped</span> <span class="error-text">{{ r.error }}</span> }</div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    } @else {
      <div class="page"><div class="skeleton" style="height:320px"></div></div>
    }
  `,
  styles: [`
    .layout { display: grid; grid-template-columns: 340px 1fr; gap: 16px; align-items: start; }
    .brief { position: sticky; top: 84px; }
    .day { display: flex; overflow: hidden; }
    .day-num { width: 72px; flex-shrink: 0; background: linear-gradient(160deg, var(--primary), var(--secondary)); color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .day-num span { font-size: 11px; opacity: .85; } .day-num b { font-size: 24px; }
    .day-body { padding: 14px 16px; flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
    .caption { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-wrap; }
    @media (max-width: 1000px) { .layout { grid-template-columns: 1fr; } .brief { position: static; } }
  `],
})
export class CampaignDetailPage implements OnInit {
  readonly id = input.required<string>();
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly campaign = signal<Campaign | null>(null);
  protected readonly busy = signal(false);
  protected readonly scheduleResults = signal<{ postId: string; dayNumber: number; scheduled: boolean; error?: string }[]>([]);
  protected brief = { topic: '', productService: '', targetAudience: '', offer: '', language: '', postingTime: '10:00', additionalInstructions: '' };

  ngOnInit(): void {
    this.load();
  }

  load() {
    this.api.get<Campaign>(`/campaigns/${this.id()}`).subscribe({ next: (c) => this.campaign.set(c), error: (e) => this.toast.error(e) });
  }

  planPrompt(day: number): string | undefined {
    return this.campaign()?.aiPlan?.days?.find((d) => d.day === day)?.imagePrompt;
  }

  generate() {
    this.busy.set(true);
    const body = Object.fromEntries(Object.entries(this.brief).filter(([, v]) => v));
    this.api.post<Campaign>(`/campaigns/${this.id()}/generate`, body).subscribe({
      next: (c) => {
        this.campaign.set(c);
        this.busy.set(false);
        this.toast.success('Campaign drafts created - review each day before scheduling');
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }

  scheduleAll() {
    this.busy.set(true);
    this.api.post<{ results: { postId: string; dayNumber: number; scheduled: boolean; error?: string }[] }>(`/campaigns/${this.id()}/schedule-all`).subscribe({
      next: (r) => {
        this.scheduleResults.set(r.results);
        this.busy.set(false);
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }

  remove() {
    if (!confirm('Delete this campaign? Its posts are kept.')) return;
    this.api.delete(`/campaigns/${this.id()}`).subscribe(() => void this.router.navigate(['/campaigns']));
  }
}
