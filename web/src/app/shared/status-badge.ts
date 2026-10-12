import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const MAP: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: '' },
  scheduled: { label: 'Scheduled', cls: 'badge-info' },
  publishing: { label: 'Publishing', cls: 'badge-warning' },
  queued: { label: 'Queued', cls: 'badge-warning' },
  pending: { label: 'Pending', cls: '' },
  processing: { label: 'Processing', cls: 'badge-warning' },
  published: { label: 'Published', cls: 'badge-success' },
  completed: { label: 'Completed', cls: 'badge-success' },
  partially_published: { label: 'Partially published', cls: 'badge-pink' },
  failed: { label: 'Failed', cls: 'badge-danger' },
  cancelled: { label: 'Cancelled', cls: '' },
  connected: { label: 'Connected', cls: 'badge-success' },
  expired: { label: 'Expired', cls: 'badge-danger' },
  revoked: { label: 'Revoked', cls: 'badge-danger' },
  error: { label: 'Error', cls: 'badge-danger' },
  active: { label: 'Active', cls: 'badge-success' },
  archived: { label: 'Archived', cls: '' },
};

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge {{ meta().cls }}"><span class="dot" [style.background]="'currentColor'"></span>{{ meta().label }}</span>`,
})
export class StatusBadge {
  readonly status = input.required<string>();
  protected readonly meta = computed(() => MAP[this.status()] ?? { label: this.status(), cls: '' });
}
