import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { BrandContextService } from '../core/brand-context.service';
import { Notification } from '../core/models';
import { NotificationsService } from '../core/notifications.service';
import { ToastService } from '../core/toast.service';
import { TimeAgoPipe, initials } from '../shared/format';
import { Icon } from '../shared/icon';

interface NavItem {
  label: string;
  icon: string;
  link: string;
  query?: Record<string, string>;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, TimeAgoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell implements OnInit, OnDestroy {
  protected readonly auth = inject(AuthService);
  protected readonly brands = inject(BrandContextService);
  protected readonly notifications = inject(NotificationsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly sidebarOpen = signal(false);
  protected readonly menu = signal<'brand' | 'create' | 'notifications' | 'user' | null>(null);
  protected readonly userInitials = computed(() => initials(`${this.auth.user()?.firstName ?? ''} ${this.auth.user()?.lastName ?? ''}`));
  protected readonly initials = initials;

  protected readonly nav: { section: string; items: NavItem[] }[] = [
    { section: 'Overview', items: [{ label: 'Dashboard', icon: 'home', link: '/dashboard' }] },
    {
      section: 'Create',
      items: [
        { label: 'Create Post', icon: 'edit', link: '/posts/new' },
        { label: 'Create Reel', icon: 'film', link: '/reels/new' },
        { label: 'AI Studio', icon: 'sparkles', link: '/ai' },
      ],
    },
    {
      section: 'Content',
      items: [
        { label: 'Calendar', icon: 'calendar', link: '/calendar' },
        { label: 'Scheduled', icon: 'clock', link: '/posts', query: { status: 'scheduled' } },
        { label: 'Published', icon: 'check', link: '/posts', query: { status: 'published' } },
        { label: 'All posts', icon: 'list', link: '/posts' },
        { label: 'Campaigns', icon: 'megaphone', link: '/campaigns' },
        { label: 'Media Library', icon: 'image', link: '/media' },
      ],
    },
    {
      section: 'Workspace',
      items: [
        { label: 'Brands', icon: 'brands', link: '/brands' },
        { label: 'Social Accounts', icon: 'link', link: '/social-accounts' },
        { label: 'Analytics', icon: 'chart', link: '/analytics' },
        { label: 'Subscription', icon: 'card', link: '/subscription' },
        { label: 'Settings', icon: 'settings', link: '/settings' },
      ],
    },
  ];

  ngOnInit(): void {
    this.brands.reload().subscribe({ error: (e) => this.toast.error(e) });
    this.notifications.start();
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.sidebarOpen.set(false);
      this.menu.set(null);
    });
  }

  ngOnDestroy(): void {
    this.notifications.stop();
  }

  toggle(menu: 'brand' | 'create' | 'notifications' | 'user', event: Event) {
    event.stopPropagation();
    const next = this.menu() === menu ? null : menu;
    this.menu.set(next);
    if (next === 'notifications') this.notifications.load();
  }

  @HostListener('document:click')
  closeMenus() {
    this.menu.set(null);
  }

  selectBrand(id: string) {
    this.brands.select(id);
    this.menu.set(null);
  }

  openNotification(n: Notification) {
    this.notifications.markRead(n);
    const postId = n.data?.['postId'] as string | undefined;
    if (postId) void this.router.navigate(['/posts', postId]);
    else if (n.data?.['socialAccountId']) void this.router.navigate(['/social-accounts']);
    else if (n.data?.['generationId']) void this.router.navigate(['/ai']);
  }

  isQueryActive(item: NavItem): boolean {
    const tree = this.router.parseUrl(this.router.url);
    const path = '/' + (tree.root.children['primary']?.segments.map((s) => s.path).join('/') ?? '');
    if (path !== item.link) return false;
    return (tree.queryParams['status'] ?? '') === (item.query?.['status'] ?? '');
  }
}
