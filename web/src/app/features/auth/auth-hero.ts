import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { PlatformIcon } from '../../shared/platform';

@Component({
  selector: 'app-auth-hero',
  imports: [Icon, PlatformIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-hero.scss',
  template: `
    <div class="brand"><span class="mark"><app-icon name="send" /></span> SocialPilot AI</div>
    <div>
      <h1>All your brands. Every platform. One click.</h1>
      <p>Create AI-powered posts and reels for each of your businesses and publish them to Instagram, Facebook, YouTube and LinkedIn together.</p>
      <div class="features">
        <div class="feature"><span><app-icon name="brands" [size]="16" /></span> Unlimited brands, fully separated</div>
        <div class="feature"><span><app-icon name="sparkles" [size]="16" /></span> AI captions, hashtags, images & reels</div>
        <div class="feature"><span><app-icon name="send" [size]="16" /></span> Publish to all with per-platform status & retry</div>
        <div class="feature"><span><app-icon name="calendar" [size]="16" /></span> Drag-and-drop content calendar</div>
      </div>
    </div>
    <div class="platforms">
      <app-platform-icon platform="instagram" [size]="30" /><app-platform-icon platform="facebook" [size]="30" />
      <app-platform-icon platform="youtube" [size]="30" /><app-platform-icon platform="linkedin" [size]="30" />
    </div>
  `,
})
export class AuthHero {}
