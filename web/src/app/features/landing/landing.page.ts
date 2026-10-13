import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Plan } from '../../core/models';
import { Icon } from '../../shared/icon';
import { PlatformIcon } from '../../shared/platform';
import { environment } from '../../../environments/environment';

const FEATURES = [
  { icon: 'sparkles', title: 'AI captions & hashtags', text: 'Describe your offer and get on-brand captions, hashtags and calls to action for every platform, in your language.' },
  { icon: 'image', title: 'AI images', text: 'Turn a topic into a ready-to-post creative with your logo, colours and offer text already on it.' },
  { icon: 'film', title: 'Reels & AI video', text: 'Write reel scripts with a hook, voice-over and subtitles, or generate a short video from a brief.' },
  { icon: 'send', title: 'Publish to all', text: 'Post to Instagram, Facebook, YouTube and LinkedIn in one click, with a live status and retry for each platform.' },
  { icon: 'calendar', title: 'Content calendar', text: 'Schedule weeks ahead and see every planned and published post on one calendar.' },
  { icon: 'brands', title: 'Multiple brands', text: 'Run several businesses from one login. Each brand keeps its own accounts, voice, media and team.' },
  { icon: 'chart', title: 'Analytics', text: 'Track reach, engagement and followers, compare platforms and find your best-performing content.' },
  { icon: 'users', title: 'Team access', text: 'Invite colleagues to a brand so everyone works from the same plan and media library.' },
];

const STEPS = [
  { title: 'Create your account', text: 'Sign up free in under a minute. No card needed.' },
  { title: 'Add your brand', text: 'Upload your logo, pick your colours and describe your brand voice.' },
  { title: 'Connect your accounts', text: 'Sign in to Instagram, Facebook, YouTube or LinkedIn securely through their official login.' },
  { title: 'Create & publish', text: 'Let AI draft your post, check the preview, then publish now or schedule it.' },
];

const FAQS = [
  { q: 'Do you see or store my social media passwords?', a: 'No. You sign in on the official Instagram, Facebook, Google or LinkedIn page. We only receive a secure access token, and you can remove our access at any time from your account settings on that platform.' },
  { q: 'Which platforms are supported?', a: 'Instagram, Facebook Pages, YouTube and LinkedIn today. X, TikTok, Pinterest and Threads are coming soon.' },
  { q: 'What kind of Instagram account do I need?', a: 'An Instagram Business or Creator account linked to a Facebook Page. Personal accounts cannot publish through Instagram\'s official API.' },
  { q: 'Can I manage more than one business?', a: 'Yes. Each brand has its own connected accounts, brand voice, media library and team. Switch between them from the top of any page.' },
  { q: 'Is there a free plan?', a: 'Yes. The Free plan lets you try everything with one brand. Upgrade whenever you need more brands, accounts or AI generations.' },
  { q: 'Can I change my plan later?', a: 'Yes, you can move to a bigger or smaller plan at any time. Contact us and we will switch it for you.' },
];

@Component({
  selector: 'app-landing-page',
  imports: [RouterLink, Icon, PlatformIcon, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './landing.page.scss',
  template: `
    <header class="nav" [class.open]="menuOpen()">
      <div class="container nav-inner">
        <a class="brand" routerLink="/"><span class="mark"><app-icon name="send" /></span> {{ appName }}</a>
        <nav class="links" (click)="menuOpen.set(false)">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <a href="/user-guide.html" target="_blank" rel="noopener">User guide</a>
        </nav>
        <div class="nav-actions">
          <a class="btn btn-ghost" routerLink="/login">Log in</a>
          <a class="btn btn-gradient" routerLink="/register">Get started free</a>
        </div>
        <button class="btn btn-ghost btn-icon menu-btn" type="button" aria-label="Menu" (click)="menuOpen.set(!menuOpen())">
          <app-icon [name]="menuOpen() ? 'x' : 'menu'" />
        </button>
      </div>
    </header>

    <main>
      <!-- Hero -->
      <section class="hero">
        <div class="container hero-inner">
          <div class="hero-copy">
            <span class="eyebrow"><app-icon name="sparkles" [size]="14" /> AI-powered social media management</span>
            <h1>All your brands. Every platform. <span class="grad">One click.</span></h1>
            <p class="lead">Create posts, images and reels with AI, then publish them to Instagram, Facebook, YouTube and LinkedIn together, or schedule them for later.</p>
            <div class="cta-row">
              <a class="btn btn-gradient btn-lg" routerLink="/register">Start free <app-icon name="send" [size]="16" /></a>
              <a class="btn btn-lg" routerLink="/login">Log in</a>
            </div>
            <div class="trust">
              <span><app-icon name="check" [size]="15" /> Free plan, no card needed</span>
              <span><app-icon name="shield" [size]="15" /> Official, secure platform login</span>
            </div>
          </div>

          <div class="hero-visual" aria-hidden="true">
            <div class="mock">
              <div class="mock-head"><span class="dot"></span><span class="dot"></span><span class="dot"></span><b>Create post</b></div>
              <div class="mock-body">
                <div class="mock-label"><app-icon name="sparkles" [size]="13" /> AI caption</div>
                <div class="mock-caption">🎉 Festive offer! Get <b>30% off</b> our billing software. GST-ready invoices in seconds. Book your free demo today 👇</div>
                <div class="mock-tags">#smallbusiness #billing #GST</div>
                <div class="mock-img"><span>30% OFF</span></div>
                <div class="mock-platforms">
                  <app-platform-icon platform="instagram" [size]="24" /><app-platform-icon platform="facebook" [size]="24" />
                  <app-platform-icon platform="youtube" [size]="24" /><app-platform-icon platform="linkedin" [size]="24" />
                  <span class="mock-btn"><app-icon name="zap" [size]="13" /> Publish to all</span>
                </div>
              </div>
            </div>
            <div class="float f1"><app-icon name="check" [size]="14" /> Published to 4 platforms</div>
            <div class="float f2"><app-icon name="calendar" [size]="14" /> Scheduled: Fri 10:00 AM</div>
          </div>
        </div>
      </section>

      <!-- Platforms -->
      <section class="strip">
        <div class="container strip-inner">
          <span>Publish to</span>
          <div class="pf"><app-platform-icon platform="instagram" [size]="26" /> Instagram</div>
          <div class="pf"><app-platform-icon platform="facebook" [size]="26" /> Facebook</div>
          <div class="pf"><app-platform-icon platform="youtube" [size]="26" /> YouTube</div>
          <div class="pf"><app-platform-icon platform="linkedin" [size]="26" /> LinkedIn</div>
        </div>
      </section>

      <!-- Features -->
      <section class="section" id="features">
        <div class="container">
          <div class="section-head">
            <span class="eyebrow">Features</span>
            <h2>Everything you need to run your social media</h2>
            <p>From the first idea to the final report, without switching between tools.</p>
          </div>
          <div class="features">
            @for (f of features; track f.title) {
              <div class="feature">
                <span class="f-icon"><app-icon [name]="f.icon" [size]="20" /></span>
                <h3>{{ f.title }}</h3>
                <p>{{ f.text }}</p>
              </div>
            }
          </div>
        </div>
      </section>

      <!-- How it works -->
      <section class="section alt" id="how">
        <div class="container">
          <div class="section-head">
            <span class="eyebrow">How it works</span>
            <h2>Go live in four simple steps</h2>
            <p>Most people publish their first post within 10 minutes.</p>
          </div>
          <ol class="steps">
            @for (s of steps; track s.title; let i = $index) {
              <li class="step">
                <span class="n">{{ i + 1 }}</span>
                <h3>{{ s.title }}</h3>
                <p>{{ s.text }}</p>
              </li>
            }
          </ol>
          <div class="security">
            <app-icon name="shield" [size]="22" />
            <div><b>Your passwords stay with you.</b> We connect through each platform's official login and never see or store your password. You can remove access at any time.</div>
          </div>
        </div>
      </section>

      <!-- Pricing -->
      <section class="section" id="pricing">
        <div class="container">
          <div class="section-head">
            <span class="eyebrow">Pricing</span>
            <h2>Simple plans that grow with you</h2>
            <p>Start free. Upgrade when you need more brands, accounts or AI.</p>
          </div>

          @if (hasYearly()) {
            <div class="billing-toggle" role="group" aria-label="Billing period">
              <button type="button" [class.active]="!yearly()" (click)="yearly.set(false)">Monthly</button>
              <button type="button" [class.active]="yearly()" (click)="yearly.set(true)">Yearly <span class="save">Save up to {{ maxSaving() }}%</span></button>
            </div>
          }

          @if (plans().length) {
            <div class="plans">
              @for (p of plans(); track p.id) {
                <div class="plan" [class.featured]="p.code === 'business'">
                  @if (p.code === 'business') { <span class="ribbon">Most popular</span> }
                  <h3>{{ p.name }}</h3>
                  <p class="plan-desc">{{ p.description }}</p>
                  <div class="price">
                    @if (isCustom(p)) {
                      <b>Custom</b><span class="per">Talk to us</span>
                    } @else if (p.priceMonthly === 0) {
                      <b>Free</b><span class="per">forever</span>
                    } @else if (yearly() && p.priceYearly > 0) {
                      <b>{{ p.priceYearly / 12 | currency: p.currency : 'symbol' : '1.0-0' }}</b><span class="per">/month</span>
                      <span class="billed">{{ p.priceYearly | currency: p.currency : 'symbol' : '1.0-0' }} billed yearly</span>
                    } @else {
                      <b>{{ p.priceMonthly | currency: p.currency : 'symbol' : '1.0-0' }}</b><span class="per">/month</span>
                    }
                  </div>
                  <ul>
                    @for (f of p.features ?? []; track f) { <li><app-icon name="check" [size]="15" /> {{ f }}</li> }
                  </ul>
                  @if (isCustom(p)) {
                    <a class="btn btn-block" href="#contact">Contact us</a>
                  } @else {
                    <a class="btn btn-block" [class.btn-gradient]="p.code === 'business'" routerLink="/register">
                      {{ p.priceMonthly === 0 ? 'Start free' : 'Get ' + p.name }}
                    </a>
                  }
                </div>
              }
            </div>
          } @else if (plansError()) {
            <div class="plans-empty">Pricing couldn't be loaded right now. <a routerLink="/register">Create a free account</a> to see all plans.</div>
          } @else {
            <div class="plans-empty"><span class="spinner"></span></div>
          }
        </div>
      </section>

      <!-- FAQ -->
      <section class="section alt" id="faq">
        <div class="container narrow">
          <div class="section-head">
            <span class="eyebrow">FAQ</span>
            <h2>Frequently asked questions</h2>
          </div>
          <div class="faqs">
            @for (f of faqs; track f.q) {
              <details class="faq">
                <summary>{{ f.q }}<app-icon name="plus" [size]="18" /></summary>
                <p>{{ f.a }}</p>
              </details>
            }
          </div>
        </div>
      </section>

      <!-- Final CTA -->
      <section class="final" id="contact">
        <div class="container final-inner">
          <h2>Ready to put your social media on autopilot?</h2>
          <p>Create your free account and publish your first post today.</p>
          <div class="cta-row center">
            <a class="btn btn-lg final-primary" routerLink="/register">Get started free</a>
            <a class="btn btn-lg final-ghost" routerLink="/login">I already have an account</a>
          </div>
        </div>
      </section>
    </main>

    <footer class="footer">
      <div class="container footer-inner">
        <a class="brand" routerLink="/"><span class="mark"><app-icon name="send" /></span> {{ appName }}</a>
        <nav>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="/user-guide.html" target="_blank" rel="noopener">User guide</a>
          <a routerLink="/login">Log in</a>
          <a routerLink="/register">Sign up</a>
        </nav>
        <span class="copy">© {{ year }} {{ appName }}. All rights reserved.</span>
      </div>
    </footer>
  `,
})
export class LandingPage {
  private readonly api = inject(ApiService);
  protected readonly appName = environment.appName;
  protected readonly year = new Date().getFullYear();
  protected readonly features = FEATURES;
  protected readonly steps = STEPS;
  protected readonly faqs = FAQS;

  protected readonly menuOpen = signal(false);
  protected readonly yearly = signal(false);
  protected readonly plans = signal<Plan[]>([]);
  protected readonly plansError = signal(false);

  protected readonly hasYearly = computed(() => this.plans().some((p) => p.priceYearly > 0 && p.priceMonthly > 0));
  protected readonly maxSaving = computed(() =>
    Math.max(0, ...this.plans().filter((p) => p.priceYearly > 0 && p.priceMonthly > 0).map((p) => Math.round((1 - p.priceYearly / (p.priceMonthly * 12)) * 100))),
  );

  constructor() {
    this.api.get<Plan[]>('/subscriptions/plans').subscribe({
      next: (p) => this.plans.set(p),
      error: () => this.plansError.set(true),
    });
  }

  /** Enterprise-style plans: no listed price, or unlimited limits. */
  protected isCustom(p: Plan) {
    return p.code === 'enterprise' || (p.priceMonthly === 0 && p.limits.some((l) => l.limitValue < 0));
  }
}
