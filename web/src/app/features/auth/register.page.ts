import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { AuthHero } from './auth-hero';

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink, AuthHero],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-layout.scss',
  template: `
    <div class="auth">
      <app-auth-hero />
      <div class="panel">
        <div class="form-card">
          <h2>Create your account</h2>
          <p class="sub">Start free - add your first brand in a minute.</p>
          @if (error()) { <div class="alert alert-danger mb-16">{{ error() }}</div> }
          <form [formGroup]="form" (ngSubmit)="submit()">
            <div class="grid grid-2">
              <div class="field"><label for="fn">First name</label><input id="fn" class="input" formControlName="firstName" autocomplete="given-name" /></div>
              <div class="field"><label for="ln">Last name</label><input id="ln" class="input" formControlName="lastName" autocomplete="family-name" /></div>
            </div>
            <div class="field"><label for="email">Work email</label><input id="email" class="input" type="email" formControlName="email" autocomplete="email" /></div>
            <div class="field"><label for="pw">Password</label>
              <input id="pw" class="input" type="password" formControlName="password" autocomplete="new-password" />
              <span class="hint">At least 8 characters with upper case, lower case and a number.</span></div>
            <button class="btn btn-primary btn-lg btn-block" type="submit" [disabled]="loading() || form.invalid">
              @if (loading()) { <span class="spinner"></span> } Create account
            </button>
          </form>
          <p class="foot">Already have an account? <a routerLink="/login">Log in</a></p>
        </div>
      </div>
    </div>
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly form = inject(FormBuilder).nonNullable.group({
    firstName: ['', Validators.required],
    lastName: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/)]],
  });

  submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set('');
    this.auth.register(this.form.getRawValue()).subscribe({
      next: () => void this.router.navigate(['/brands/new'], { queryParams: { welcome: 1 } }),
      error: (e: Error) => {
        this.error.set(e.message);
        this.loading.set(false);
      },
    });
  }
}
