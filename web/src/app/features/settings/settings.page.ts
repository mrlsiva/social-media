import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Session, User } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { TimeAgoPipe } from '../../shared/format';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-settings-page',
  imports: [FormsModule, Icon, DatePipe, TimeAgoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page" style="max-width:960px">
      <div class="page-header"><div><h1>Settings</h1><p>Your profile, security and signed-in devices.</p></div></div>

      <div class="card">
        <div class="card-header"><h2>Profile</h2></div>
        <div class="card-body grid grid-2">
          <div class="field"><label>First name</label><input class="input" [(ngModel)]="profile.firstName" /></div>
          <div class="field"><label>Last name</label><input class="input" [(ngModel)]="profile.lastName" /></div>
          <div class="field"><label>Email</label><input class="input" [value]="auth.user()?.email" disabled /></div>
          <div class="field"><label>Phone</label><input class="input" [(ngModel)]="profile.phone" /></div>
          <div class="field"><label>Timezone</label><input class="input" [(ngModel)]="profile.timezone" /></div>
        </div>
        <div class="card-footer"><button class="btn btn-primary" type="button" (click)="saveProfile()">Save profile</button></div>
      </div>

      <div class="card mt-16">
        <div class="card-header"><h2>Password</h2></div>
        <div class="card-body grid grid-2">
          <div class="field"><label>Current password</label><input class="input" type="password" [(ngModel)]="pw.current" autocomplete="current-password" /></div>
          <div class="field"><label>New password</label><input class="input" type="password" [(ngModel)]="pw.next" autocomplete="new-password" />
            <span class="hint">8+ characters with upper, lower case and a number. Other devices will be signed out.</span></div>
        </div>
        <div class="card-footer"><button class="btn btn-primary" type="button" [disabled]="!pw.current || !pw.next" (click)="changePassword()">Change password</button></div>
      </div>

      <div class="card mt-16">
        <div class="card-header"><h2>Devices & sessions</h2><button class="btn btn-sm btn-danger" type="button" (click)="auth.logout(true)">Log out everywhere</button></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Device</th><th>IP</th><th>Last active</th><th>Signed in</th><th></th></tr></thead>
          <tbody>
            @for (s of sessions(); track s.id) {
              <tr>
                <td><div class="row"><app-icon [name]="s.platform === 'web' ? 'monitor' : 'smartphone'" />
                  <div><b>{{ s.deviceName || s.platform }}</b> @if (s.current) { <span class="badge badge-success">This device</span> }<div class="muted small">{{ s.platform }}</div></div></div></td>
                <td class="small">{{ s.ipAddress }}</td>
                <td class="small">{{ s.lastUsedAt | ago }}</td>
                <td class="small">{{ s.createdAt | date: 'd MMM y' }}</td>
                <td>@if (!s.current) { <button class="btn btn-sm" type="button" (click)="revoke(s)">Log out</button> }</td>
              </tr>
            }
          </tbody></table></div>
      </div>
    </div>
  `,
})
export class SettingsPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly sessions = signal<Session[]>([]);
  protected profile = { firstName: '', lastName: '', phone: '', timezone: '' };
  protected pw = { current: '', next: '' };

  ngOnInit(): void {
    this.api.get<User>('/users/me').subscribe((u) => (this.profile = { firstName: u.firstName, lastName: u.lastName ?? '', phone: u.phone ?? '', timezone: u.timezone }));
    this.loadSessions();
  }

  loadSessions() {
    this.api.get<Session[]>('/auth/sessions').subscribe((s) => this.sessions.set(s));
  }

  saveProfile() {
    const body = { firstName: this.profile.firstName, lastName: this.profile.lastName || undefined, phone: this.profile.phone || undefined, timezone: this.profile.timezone || undefined };
    this.api.patch<User>('/users/me', body).subscribe({
      next: (u) => {
        this.auth.setUser(u);
        this.toast.success('Profile saved');
      },
      error: (e) => this.toast.error(e),
    });
  }

  changePassword() {
    this.api.post('/auth/change-password', { currentPassword: this.pw.current, newPassword: this.pw.next }).subscribe({
      next: () => {
        this.pw = { current: '', next: '' };
        this.toast.success('Password changed. Other devices were signed out.');
        this.loadSessions();
      },
      error: (e) => this.toast.error(e),
    });
  }

  revoke(s: Session) {
    this.api.delete(`/auth/sessions/${s.id}`).subscribe({ next: () => this.loadSessions(), error: (e) => this.toast.error(e) });
  }
}
