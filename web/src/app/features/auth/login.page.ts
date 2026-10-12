import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { AuthHero } from './auth-hero';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, AuthHero],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-layout.scss',
  template: `
    <div class="auth">
      <app-auth-hero />
      <div class="panel">
        <div class="form-card">
          <h2>Welcome back</h2>
          <p class="sub">Log in to manage your brands and content.</p>
          @if (error()) { <div class="alert alert-danger mb-16">{{ error() }}</div> }
          <form [formGroup]="form" (ngSubmit)="submit()">
            <div class="field"><label for="email">Email</label>
              <input id="email" class="input" type="email" formControlName="email" autocomplete="email" placeholder="you@company.com" /></div>
            <div class="field"><label for="password">Password</label>
              <input id="password" class="input" type="password" formControlName="password" autocomplete="current-password" /></div>
            <button class="btn btn-primary btn-lg btn-block" type="submit" [disabled]="loading() || form.invalid">
              @if (loading()) { <span class="spinner"></span> } Log in
            </button>
          </form>
          <p class="foot">New here? <a routerLink="/register">Create an account</a></p>
        </div>
      </div>
    </div>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set('');
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => void this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('returnUrl') ?? '/dashboard'),
      error: (e: Error) => {
        this.error.set(e.message);
        this.loading.set(false);
      },
    });
  }
}
