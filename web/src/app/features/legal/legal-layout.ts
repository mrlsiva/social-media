import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Icon } from '../../shared/icon';
import { LEGAL } from './legal.config';

/** Shared public shell for the legal pages: header, title block, content and footer. */
@Component({
  selector: 'app-legal-layout',
  imports: [RouterLink, RouterLinkActive, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="nav">
      <div class="container nav-inner">
        <a class="brand" routerLink="/"><span class="mark"><app-icon name="send" /></span> {{ legal.product }}</a>
        <div class="nav-actions">
          <a class="btn btn-ghost" routerLink="/login">Log in</a>
          <a class="btn btn-gradient" routerLink="/register">Get started</a>
        </div>
      </div>
    </header>

    <main class="container doc">
      <nav class="tabs" aria-label="Legal pages">
        <a routerLink="/privacy-policy" routerLinkActive="active">Privacy Policy</a>
        <a routerLink="/terms" routerLinkActive="active">Terms of Service</a>
        <a routerLink="/data-deletion" routerLinkActive="active">Data Deletion</a>
      </nav>
      <h1>{{ title() }}</h1>
      <p class="meta">Effective date: {{ legal.effectiveDate }}</p>
      <article class="content"><ng-content /></article>
    </main>

    <footer class="footer">
      <div class="container footer-inner">
        <span>© {{ year }} {{ legal.company }}. All rights reserved.</span>
        <nav>
          <a routerLink="/">Home</a>
          <a routerLink="/privacy-policy">Privacy</a>
          <a routerLink="/terms">Terms</a>
          <a routerLink="/data-deletion">Data deletion</a>
          <a [href]="'mailto:' + legal.email">{{ legal.email }}</a>
        </nav>
      </div>
    </footer>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100vh; background: var(--surface); }
    .container { max-width: 880px; margin: 0 auto; padding: 0 24px; width: 100%; }
    .nav { position: sticky; top: 0; z-index: 10; background: rgba(255, 255, 255, .9); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); }
    .nav .container { max-width: 1180px; }
    .nav-inner { display: flex; align-items: center; justify-content: space-between; height: 64px; }
    .brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 800; font-size: 17px; color: var(--text); text-decoration: none !important; }
    .mark { width: 34px; height: 34px; border-radius: 10px; background: linear-gradient(135deg, var(--primary), var(--secondary)); color: #fff; display: grid; place-items: center; }
    .nav-actions { display: flex; gap: 8px; }
    .doc { flex: 1; padding-top: 32px; padding-bottom: 72px; }
    .tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 28px; }
    .tabs a { padding: 7px 14px; border-radius: 999px; font-size: 13.5px; font-weight: 600; color: var(--text-2); background: var(--surface-2); }
    .tabs a:hover { text-decoration: none; color: var(--text); }
    .tabs a.active { background: var(--primary-50); color: var(--primary); }
    h1 { font-size: 36px; font-weight: 800; letter-spacing: -0.02em; }
    .meta { color: var(--muted); margin-top: 8px; font-size: 14px; }
    .content { margin-top: 28px; font-size: 15.5px; line-height: 1.7; color: var(--text-2); }
    .content ::ng-deep h2 { font-size: 21px; color: var(--text); margin: 36px 0 10px; }
    .content ::ng-deep h3 { font-size: 16.5px; color: var(--text); margin: 22px 0 6px; }
    .content ::ng-deep p { margin: 0 0 14px; }
    .content ::ng-deep ul, .content ::ng-deep ol { margin: 0 0 14px; padding-left: 22px; }
    .content ::ng-deep li { margin-bottom: 6px; }
    .content ::ng-deep b, .content ::ng-deep strong { color: var(--text); }
    .content ::ng-deep .callout { background: var(--primary-50); border-radius: 14px; padding: 16px 20px; margin: 20px 0; color: var(--text-2); }
    .content ::ng-deep .steps-box { border: 1px solid var(--border); border-radius: 16px; padding: 20px 24px; margin: 16px 0 20px; }
    .footer { border-top: 1px solid var(--border); padding: 24px 0; color: var(--muted); font-size: 13.5px; }
    .footer-inner { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .footer nav { display: flex; gap: 16px; flex-wrap: wrap; }
    .footer a { color: var(--text-2); font-weight: 600; }
    @media (max-width: 640px) {
      .container { padding: 0 16px; }
      h1 { font-size: 28px; }
      .nav-actions .btn-ghost { display: none; }
      .footer-inner { flex-direction: column; }
    }
  `],
})
export class LegalLayout {
  readonly title = input.required<string>();
  protected readonly legal = LEGAL;
  protected readonly year = new Date().getFullYear();
}
