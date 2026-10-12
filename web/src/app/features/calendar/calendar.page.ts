import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { BrandContextService } from '../../core/brand-context.service';
import { CalendarEvent, Post } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { toLocalInput } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';
import { PlatformIcon } from '../../shared/platform';
import { StatusBadge } from '../../shared/status-badge';

type View = 'month' | 'week' | 'day';
const DAY = 86_400_000;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MOVABLE = new Set(['draft', 'scheduled', 'failed', 'cancelled']);

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const startOfWeek = (d: Date) => {
  const s = startOfDay(d);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); // Monday
  return s;
};

@Component({
  selector: 'app-calendar-page',
  imports: [FormsModule, Icon, PlatformIcon, StatusBadge, Modal, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './calendar.page.html',
  styleUrl: './calendar.page.scss',
})
export class CalendarPage {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly brands = inject(BrandContextService);

  protected readonly view = signal<View>('month');
  protected readonly cursor = signal(startOfDay(new Date()));
  protected readonly events = signal<CalendarEvent[]>([]);
  protected readonly selected = signal<CalendarEvent | null>(null);
  protected readonly dragId = signal<string | null>(null);
  protected readonly dropTarget = signal<string | null>(null);
  protected rescheduleAt = '';
  protected readonly hours = HOURS;
  protected readonly weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  protected readonly today = startOfDay(new Date());

  protected readonly range = computed(() => {
    const c = this.cursor();
    if (this.view() === 'day') return { from: c, to: new Date(c.getTime() + DAY) };
    if (this.view() === 'week') {
      const from = startOfWeek(c);
      return { from, to: new Date(from.getTime() + 7 * DAY) };
    }
    const from = startOfWeek(new Date(c.getFullYear(), c.getMonth(), 1));
    return { from, to: new Date(from.getTime() + 42 * DAY) };
  });

  protected readonly days = computed(() => {
    const { from, to } = this.range();
    const out: Date[] = [];
    for (let d = new Date(from); d < to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) out.push(d);
    return out;
  });

  protected readonly title = computed(() => {
    const c = this.cursor();
    if (this.view() === 'month') return c.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (this.view() === 'day') return c.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const { from } = this.range();
    const end = new Date(from.getTime() + 6 * DAY);
    return `${from.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  });

  constructor() {
    effect(() => {
      const brandId = this.brands.currentBrandId();
      const { from, to } = this.range();
      if (brandId) this.load(brandId, from, to);
    });
  }

  load(brandId: string, from: Date, to: Date) {
    this.api.get<CalendarEvent[]>('/posts/calendar', { brandId, from: from.toISOString(), to: to.toISOString() }).subscribe({
      next: (e) => this.events.set(e),
      error: (err) => this.toast.error(err),
    });
  }

  reload() {
    const brandId = this.brands.currentBrandId();
    const { from, to } = this.range();
    if (brandId) this.load(brandId, from, to);
  }

  eventsOn(day: Date, hour?: number): CalendarEvent[] {
    return this.events().filter((e) => {
      const d = new Date(e.date);
      return sameDay(d, day) && (hour === undefined || d.getHours() === hour);
    });
  }

  isToday(d: Date) {
    return sameDay(d, this.today);
  }

  inMonth(d: Date) {
    return d.getMonth() === this.cursor().getMonth();
  }

  move(delta: number) {
    const c = this.cursor();
    if (this.view() === 'month') this.cursor.set(new Date(c.getFullYear(), c.getMonth() + delta, 1));
    else this.cursor.set(new Date(c.getTime() + delta * (this.view() === 'week' ? 7 : 1) * DAY));
  }

  goToday() {
    this.cursor.set(startOfDay(new Date()));
  }

  openDay(d: Date) {
    this.cursor.set(d);
    this.view.set('day');
  }

  // ------------------------------------------------------------ drag & drop

  canMove(e: CalendarEvent) {
    return MOVABLE.has(e.status);
  }

  onDragStart(event: DragEvent, e: CalendarEvent) {
    if (!this.canMove(e)) return event.preventDefault();
    this.dragId.set(e.id);
    event.dataTransfer?.setData('text/plain', e.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onDragOver(event: DragEvent, key: string) {
    if (!this.dragId()) return;
    event.preventDefault();
    this.dropTarget.set(key);
  }

  /** Drop on a day (keeps the time of day) or on an hour slot (week/day views). */
  onDrop(event: DragEvent, day: Date, hour?: number) {
    event.preventDefault();
    const id = this.dragId();
    this.dragId.set(null);
    this.dropTarget.set(null);
    const ev = this.events().find((e) => e.id === id);
    if (!ev) return;
    const original = new Date(ev.scheduledAt ?? ev.date);
    const target = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour ?? original.getHours(), hour === undefined ? original.getMinutes() : 0);
    if (target.getTime() < Date.now() + 60_000) return this.toast.warning('Pick a time in the future');
    this.schedule(ev, target);
  }

  private schedule(ev: CalendarEvent, when: Date) {
    // optimistic update
    this.events.update((list) => list.map((e) => (e.id === ev.id ? { ...e, date: when.toISOString(), scheduledAt: when.toISOString(), status: 'scheduled' } : e)));
    this.api.post<Post>(`/posts/${ev.id}/schedule`, { scheduledAt: when.toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }).subscribe({
      next: () => this.toast.success(`Scheduled for ${when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`),
      error: (err) => {
        this.toast.error(err);
        this.reload();
      },
    });
  }

  // ------------------------------------------------------------ actions

  select(e: CalendarEvent) {
    this.selected.set(e);
    this.rescheduleAt = toLocalInput(new Date(e.scheduledAt ?? Math.max(Date.now() + 3600_000, new Date(e.date).getTime())));
  }

  reschedule() {
    const e = this.selected();
    if (!e) return;
    const when = new Date(this.rescheduleAt);
    if (when.getTime() < Date.now() + 60_000) return this.toast.warning('Pick a time in the future');
    this.selected.set(null);
    this.schedule(e, when);
  }

  edit(e: CalendarEvent) {
    void this.router.navigate(['/posts', e.id]);
  }

  duplicate(e: CalendarEvent) {
    this.api.post<Post>(`/posts/${e.id}/duplicate`).subscribe({
      next: () => {
        this.selected.set(null);
        this.toast.success('Duplicated as draft');
        this.reload();
      },
      error: (err) => this.toast.error(err),
    });
  }

  remove(e: CalendarEvent) {
    if (!confirm('Delete this post?')) return;
    this.api.delete(`/posts/${e.id}`).subscribe({
      next: () => {
        this.selected.set(null);
        this.events.update((list) => list.filter((x) => x.id !== e.id));
      },
      error: (err) => this.toast.error(err),
    });
  }

  newPost(day: Date, hour = 10) {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour);
    void this.router.navigate(['/posts/new'], { queryParams: { date: d.toISOString() } });
  }

  key(d: Date, h?: number) {
    return `${d.toDateString()}-${h ?? 'd'}`;
  }
}
