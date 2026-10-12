import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, finalize, map, shareReplay, tap } from 'rxjs';
import { ApiService } from './api.service';
import { AuthResponse, TokenPair, User } from './models';

const STORAGE_KEY = 'sp.auth';

interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  user: User;
}

/** Stable per-browser device id so the API can manage this session as a device. */
function deviceId(): string {
  let id = localStorage.getItem('sp.deviceId');
  if (!id) {
    id = `web-${crypto.randomUUID()}`;
    localStorage.setItem('sp.deviceId', id);
  }
  return id;
}

function deviceName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return `${browser}${os ? ` on ${os}` : ''}`;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly state = signal<StoredAuth | null>(this.load());
  private refreshInFlight: Observable<string> | null = null;

  readonly user = computed(() => this.state()?.user ?? null);
  readonly isAuthenticated = computed(() => !!this.state());
  readonly isAdmin = computed(() => this.user()?.roles.includes('admin') ?? false);

  get accessToken(): string | null {
    return this.state()?.accessToken ?? null;
  }

  login(email: string, password: string): Observable<User> {
    return this.api
      .post<AuthResponse>('/auth/login', { email, password, deviceId: deviceId(), deviceName: deviceName(), platform: 'web' })
      .pipe(tap((res) => this.store(res.tokens, res.user)), map((res) => res.user));
  }

  register(data: { firstName: string; lastName?: string; email: string; password: string }): Observable<User> {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return this.api
      .post<AuthResponse>('/auth/register', { ...data, timezone, deviceId: deviceId(), deviceName: deviceName(), platform: 'web' })
      .pipe(tap((res) => this.store(res.tokens, res.user)), map((res) => res.user));
  }

  /** Single-flight refresh: concurrent 401s share one rotation request. */
  refresh(): Observable<string> {
    if (!this.refreshInFlight) {
      const refreshToken = this.state()?.refreshToken;
      this.refreshInFlight = this.api.post<AuthResponse>('/auth/refresh', { refreshToken }).pipe(
        tap((res) => this.store(res.tokens, res.user)),
        map((res) => res.tokens.accessToken),
        finalize(() => (this.refreshInFlight = null)),
        shareReplay(1),
      );
    }
    return this.refreshInFlight;
  }

  logout(everywhere = false): void {
    const done = () => this.clearAndRedirect();
    if (!this.state()) return done();
    this.api.post(everywhere ? '/auth/logout-all' : '/auth/logout').subscribe({ complete: done, error: done });
  }

  setUser(user: User): void {
    const s = this.state();
    if (s) this.persist({ ...s, user });
  }

  clearAndRedirect(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.state.set(null);
    void this.router.navigate(['/login']);
  }

  private store(tokens: TokenPair, user: User): void {
    this.persist({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user });
  }

  private persist(value: StoredAuth): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    this.state.set(value);
  }

  private load(): StoredAuth | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as StoredAuth) : null;
    } catch {
      return null;
    }
  }
}
