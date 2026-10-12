import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Notification } from './models';

/** Polls the unread count (mobile apps get the same data + push). */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly api = inject(ApiService);
  readonly unread = signal(0);
  readonly items = signal<Notification[]>([]);
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.refreshCount();
    this.timer ??= setInterval(() => this.refreshCount(), 60_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  refreshCount(): void {
    this.api.get<{ count: number }>('/notifications/unread-count').subscribe({ next: (r) => this.unread.set(r.count), error: () => undefined });
  }

  load(): void {
    this.api.list<Notification>('/notifications', { page: 1, limit: 15 }).subscribe((r) => this.items.set(r.items));
  }

  markAllRead(): void {
    this.api.post('/notifications/read-all').subscribe(() => {
      this.unread.set(0);
      this.items.update((list) => list.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    });
  }

  markRead(n: Notification): void {
    if (n.readAt) return;
    this.api.patch(`/notifications/${n.id}/read`).subscribe(() => {
      this.unread.update((c) => Math.max(0, c - 1));
      this.items.update((list) => list.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    });
  }
}
