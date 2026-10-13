import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LegalLayout } from './legal-layout';
import { LEGAL } from './legal.config';

@Component({
  selector: 'app-data-deletion-page',
  imports: [LegalLayout, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-legal-layout title="Data Deletion Instructions">
      <p>You can remove the data {{ l.product }} holds about you at any time. This page explains how to disconnect your social accounts, remove our app's access from Facebook, Instagram, Google and LinkedIn, and request full deletion of your account.</p>

      <h2>Option 1: Disconnect a social account (instant)</h2>
      <div class="steps-box">
        <ol>
          <li>Log in to <a routerLink="/login">{{ l.product }}</a>.</li>
          <li>Open <b>Social Accounts</b> from the left menu.</li>
          <li>Click the <b>bin icon</b> next to the account you want to remove.</li>
        </ol>
      </div>
      <p>The account's access tokens are revoked and deleted from our systems immediately, and we can no longer post to or read from that account.</p>

      <h2>Option 2: Remove our app from the platform</h2>
      <p>You can also remove our access directly from each platform. Our access stops as soon as you do this.</p>
      <h3>Facebook and Instagram</h3>
      <ol>
        <li>Go to Facebook <b>Settings &amp; privacy</b>, then <b>Settings</b>.</li>
        <li>Open <a href="https://www.facebook.com/settings?tab=business_tools" target="_blank" rel="noopener"><b>Business integrations</b></a> (or <b>Apps and websites</b>).</li>
        <li>Find <b>{{ l.product }}</b> and click <b>Remove</b>.</li>
      </ol>
      <h3>YouTube (Google)</h3>
      <ol>
        <li>Open your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">Google Account permissions</a>.</li>
        <li>Select <b>{{ l.product }}</b> and click <b>Remove access</b>.</li>
      </ol>
      <h3>LinkedIn</h3>
      <ol>
        <li>Go to LinkedIn <a href="https://www.linkedin.com/psettings/permitted-services" target="_blank" rel="noopener"><b>Settings, Data privacy, Permitted services</b></a>.</li>
        <li>Find <b>{{ l.product }}</b> and click <b>Remove</b>.</li>
      </ol>

      <h2>Option 3: Delete your account and all data</h2>
      <div class="steps-box">
        <ol>
          <li>Email <a [href]="deleteMailto">{{ l.email }}</a> with the subject <b>"Delete my account"</b>.</li>
          <li>Send it from the email address registered with your account, so we can verify the request.</li>
          <li>We will confirm by email once your data has been deleted.</li>
        </ol>
      </div>
      <p>We complete deletion requests within <b>{{ l.deletionDays }} days</b>. This permanently deletes:</p>
      <ul>
        <li>your profile and login details;</li>
        <li>brands you own, including logos, brand settings and team invitations;</li>
        <li>connected social accounts and all their access tokens;</li>
        <li>posts, captions, schedules, campaigns, AI generations and uploaded media;</li>
        <li>analytics stored for your accounts.</li>
      </ul>
      <p>Content you have already published to Facebook, Instagram, YouTube or LinkedIn stays on those platforms. Delete it there if you want it removed. We may keep limited records, such as billing records, where the law requires it.</p>

      <div class="callout">
        Questions about your data? Contact us at <a [href]="'mailto:' + l.email">{{ l.email }}</a>. See our <a routerLink="/privacy-policy">Privacy Policy</a> for more detail.
      </div>
    </app-legal-layout>
  `,
})
export class DataDeletionPage {
  protected readonly l = LEGAL;
  protected readonly deleteMailto = `mailto:${LEGAL.email}?subject=${encodeURIComponent('Delete my account')}`;
}
