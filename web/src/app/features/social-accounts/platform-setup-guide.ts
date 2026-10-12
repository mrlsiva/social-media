import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Platform, PlatformInfo } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';
import { PlatformIcon } from '../../shared/platform';

interface Guide {
  /** What the person connecting needs on the platform side. */
  requirements: string[];
  console: { label: string; url: string };
  /** Server setup steps; `{callback}` is replaced with the platform's OAuth callback URL. */
  steps: string[];
  env: (callback: string) => string;
  limits: string[];
}

const META_ENV = (callback: string) =>
  `META_APP_ID=your_app_id\nMETA_APP_SECRET=your_app_secret\nMETA_REDIRECT_URI=${callback}\nMETA_GRAPH_VERSION=v25.0`;

const META_STEPS = [
  'Open <b>Meta for Developers</b> → <b>My Apps → Create app</b> and choose the <b>Business</b> type.',
  'Add the <b>Facebook Login for Business</b> product. Under <b>Settings → Valid OAuth Redirect URIs</b>, add the callback URL below.',
  'In <b>App settings → Basic</b>, copy the <b>App ID</b> and <b>App Secret</b>, and add your Privacy Policy URL and app domain.',
  'Paste the values into <b>backend/.env</b> and restart the API.',
  'While the app is in development mode, only people with an <b>App role</b> (admin, developer, tester) can connect. Going live needs <b>Business Verification</b> and <b>App Review</b>.',
];

const GUIDES: Partial<Record<Platform, Guide>> = {
  instagram: {
    requirements: [
      'An Instagram <b>Professional</b> account (Business or Creator). Personal accounts cannot publish through the API.',
      'The Instagram account must be <b>linked to a Facebook Page</b> you manage.',
      'Instagram uses the same Meta app as Facebook. Setting it up once enables both.',
    ],
    console: { label: 'Meta for Developers', url: 'https://developers.facebook.com/apps' },
    steps: [
      ...META_STEPS.slice(0, 4),
      'Permissions requested: <span class="kbd">instagram_basic</span> <span class="kbd">instagram_content_publish</span> <span class="kbd">instagram_manage_insights</span> <span class="kbd">pages_show_list</span> <span class="kbd">pages_read_engagement</span> <span class="kbd">business_management</span>',
      META_STEPS[4],
    ],
    env: META_ENV,
    limits: [
      'Instagram downloads media from <b>APP_URL</b>, so it must be a <b>public HTTPS</b> address. On localhost use a tunnel (ngrok / cloudflared).',
      'Images are published as JPEG (PNG/WEBP are converted automatically). Aspect ratio 4:5 – 1.91:1.',
      'Up to 100 API posts per 24 h per account · captions ≤ 2,200 chars · ≤ 30 hashtags · carousels 2–10 items.',
    ],
  },
  facebook: {
    requirements: [
      'You must be an admin (or have full control) of the <b>Facebook Page</b> you want to post to.',
      'Posts are published as the Page, not your personal profile.',
    ],
    console: { label: 'Meta for Developers', url: 'https://developers.facebook.com/apps' },
    steps: [
      ...META_STEPS.slice(0, 4),
      'Permissions requested: <span class="kbd">pages_show_list</span> <span class="kbd">pages_read_engagement</span> <span class="kbd">pages_manage_posts</span> <span class="kbd">read_insights</span> <span class="kbd">business_management</span>',
      META_STEPS[4],
    ],
    env: META_ENV,
    limits: [
      'Up to 30 API-published reels per 24 h per Page.',
      'Page tokens stop working if you change your Facebook password, remove the app or lose Page access. Reconnect when the account shows <b>Expired</b>.',
    ],
  },
  youtube: {
    requirements: ['A Google account with a <b>YouTube channel</b>.'],
    console: { label: 'Google Cloud Console', url: 'https://console.cloud.google.com/apis/credentials' },
    steps: [
      'Create a project in <b>Google Cloud Console</b>.',
      'In <b>APIs &amp; Services → Library</b>, enable <b>YouTube Data API v3</b>.',
      'On the <b>OAuth consent screen</b>, choose <b>External</b>, add the scopes <span class="kbd">youtube.upload</span> and <span class="kbd">youtube.readonly</span>, and add your Google account as a <b>test user</b>.',
      'In <b>Credentials → Create credentials → OAuth client ID → Web application</b>, add the callback URL below to <b>Authorized redirect URIs</b>.',
      'Copy the client ID and secret into <b>backend/.env</b> and restart the API.',
    ],
    env: (callback) => `GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com\nGOOGLE_CLIENT_SECRET=xxxx\nGOOGLE_REDIRECT_URI=${callback}`,
    limits: [
      'Videos from <b>unaudited</b> API projects stay <b>private</b>. Submit the YouTube API compliance audit to publish publicly.',
      '<span class="kbd">youtube.upload</span> is a sensitive scope, so Google verification is needed for production.',
      'Default quota is 10,000 units/day and uploads are expensive. Custom thumbnails need a verified channel.',
    ],
  },
  linkedin: {
    requirements: [
      'Posting to your <b>personal profile</b> works out of the box.',
      'Posting to <b>company pages</b> needs LinkedIn <b>Community Management API</b> approval and you must be a page admin.',
    ],
    console: { label: 'LinkedIn Developers', url: 'https://www.linkedin.com/developers/apps' },
    steps: [
      'Open <b>LinkedIn Developers</b> → <b>Create app</b> (it must be associated with a LinkedIn Page).',
      'In <b>Products</b>, add <b>Sign In with LinkedIn using OpenID Connect</b> and <b>Share on LinkedIn</b>.',
      'For company pages, also request <b>Community Management API</b> and use the longer <span class="kbd">LINKEDIN_SCOPES</span> noted in .env.',
      'In the <b>Auth</b> tab, add the callback URL below to <b>Authorized redirect URLs</b>, then copy the client ID and secret.',
      'Paste the values into <b>backend/.env</b> and restart the API.',
    ],
    env: (callback) =>
      `LINKEDIN_CLIENT_ID=xxxx\nLINKEDIN_CLIENT_SECRET=xxxx\nLINKEDIN_REDIRECT_URI=${callback}\nLINKEDIN_SCOPES=openid profile w_member_social`,
    limits: [
      'Access tokens last about 60 days. When the account shows <b>Expired</b>, reconnect it.',
      'Posts: one image, 2–20 images, one video, or a link. Text up to 3,000 characters.',
    ],
  },
};

@Component({
  selector: 'app-platform-setup-guide',
  imports: [Modal, Icon, PlatformIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [title]="platform().name + ' setup guide'" (closed)="closed.emit()">
      @if (guide(); as g) {
        <div class="stack">
          <div class="row status">
            <app-platform-icon [platform]="platform().platform" [size]="32" />
            @if (platform().configured) {
              <span class="ok"><app-icon name="check" [size]="15" /> Server is configured. You can click <b>Connect</b>.</span>
            } @else {
              <span class="warn"><app-icon name="alert" [size]="15" /> Not configured yet. An administrator needs to finish step 2.</span>
            }
          </div>

          <section>
            <h3>1. Before you connect</h3>
            <ul>@for (r of g.requirements; track $index) { <li [innerHTML]="r"></li> }</ul>
          </section>

          <section>
            <h3>2. Server setup <span class="muted small">(administrator, one time)</span></h3>
            <ol>@for (s of g.steps; track $index) { <li [innerHTML]="s"></li> }</ol>
            <a class="btn btn-sm mt-8" [href]="g.console.url" target="_blank" rel="noopener">
              <app-icon name="external" [size]="14" /> Open {{ g.console.label }}
            </a>
          </section>

          <section>
            <h3>Callback URL</h3>
            <div class="copy-row">
              <code>{{ callback() }}</code>
              <button class="btn btn-ghost btn-icon btn-sm" type="button" title="Copy" (click)="copy(callback())"><app-icon name="copy" [size]="15" /></button>
            </div>
          </section>

          <section>
            <h3>backend/.env</h3>
            <div class="copy-row">
              <pre>{{ g.env(callback()) }}</pre>
              <button class="btn btn-ghost btn-icon btn-sm" type="button" title="Copy" (click)="copy(g.env(callback()))"><app-icon name="copy" [size]="15" /></button>
            </div>
          </section>

          <section>
            <h3>3. Connect</h3>
            <p class="text-2">Restart the API, reload this page and click <b>Connect</b> on the {{ platform().name }} card. Sign in to {{ platform().name }} and approve the permissions.</p>
          </section>

          <section>
            <h3>Limits &amp; tips</h3>
            <ul>@for (l of g.limits; track $index) { <li [innerHTML]="l"></li> }</ul>
          </section>
        </div>
      }
    </app-modal>
  `,
  styles: [`
    h3 { font-size: 14px; margin-bottom: 6px; }
    ul, ol { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-2); line-height: 1.5; }
    .status { gap: 10px; align-items: center; padding: 10px 12px; border-radius: 12px; background: var(--surface-2); font-size: 13px; }
    .status span { display: inline-flex; align-items: center; gap: 6px; }
    .ok { color: var(--success); } .warn { color: var(--warning); }
    .copy-row { display: flex; align-items: flex-start; gap: 6px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; padding: 8px 8px 8px 12px; }
    .copy-row code, .copy-row pre { flex: 1; min-width: 0; margin: 0; font-family: ui-monospace, monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; padding-top: 4px; }
  `],
})
export class PlatformSetupGuide {
  private readonly toast = inject(ToastService);
  readonly platform = input.required<PlatformInfo>();
  readonly closed = output<void>();

  protected readonly guide = computed(() => GUIDES[this.platform().platform]);
  protected readonly callback = computed(() => {
    const p = this.platform();
    const route = p.platform === 'instagram' ? 'facebook' : p.platform;
    return p.redirectUri ?? `http://localhost:3000/api/v1/social-accounts/${route}/callback`;
  });

  copy(text: string) {
    void navigator.clipboard.writeText(text).then(() => this.toast.success('Copied'));
  }
}
