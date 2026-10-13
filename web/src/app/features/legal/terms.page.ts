import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LegalLayout } from './legal-layout';
import { LEGAL } from './legal.config';

@Component({
  selector: 'app-terms-page',
  imports: [LegalLayout, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-legal-layout title="Terms of Service">
      <p>These Terms of Service ("Terms") govern your use of {{ l.product }} at <a [href]="l.website">{{ l.website }}</a> (the "Service"), operated by {{ l.company }} ("we", "us", "our"). By creating an account or using the Service, you agree to these Terms. If you use the Service on behalf of a business, you confirm you are authorised to accept these Terms for it.</p>

      <h2>1. The Service</h2>
      <p>{{ l.product }} lets you create content (including with AI), manage multiple brands, connect social media accounts, and publish or schedule posts to platforms such as Instagram, Facebook, YouTube and LinkedIn, and view analytics.</p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be at least 18 years old and provide accurate information.</li>
        <li>You are responsible for keeping your login details secure and for all activity under your account.</li>
        <li>Tell us immediately at <a [href]="'mailto:' + l.email">{{ l.email }}</a> if you suspect unauthorised use.</li>
      </ul>

      <h2>3. Connected social accounts</h2>
      <ul>
        <li>You may only connect accounts and Pages you own or are authorised to manage.</li>
        <li>You authorise us to publish content and read analytics on those accounts on your instructions.</li>
        <li>You must follow each platform's own terms, including the <a href="https://www.facebook.com/terms.php" target="_blank" rel="noopener">Meta Terms</a>, <a href="https://www.instagram.com/legal/terms/" target="_blank" rel="noopener">Instagram Terms of Use</a>, <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener">YouTube Terms of Service</a> and <a href="https://www.linkedin.com/legal/user-agreement" target="_blank" rel="noopener">LinkedIn User Agreement</a>. By using YouTube features you agree to be bound by the YouTube Terms of Service.</li>
        <li>Platforms may change or limit their APIs at any time, which can affect features. We are not responsible for actions taken by those platforms.</li>
      </ul>

      <h2>4. Your content</h2>
      <ul>
        <li>You keep ownership of all content you upload or create through the Service.</li>
        <li>You grant us a limited licence to store, process and transmit your content only as needed to provide the Service.</li>
        <li>You are responsible for your content and confirm you have the rights to publish it.</li>
      </ul>

      <h2>5. AI-generated content</h2>
      <p>AI features can produce inaccurate, incomplete or unsuitable results. Please review all AI-generated content before publishing. You are responsible for content you choose to publish, and you may use AI output you generate subject to these Terms and applicable law.</p>

      <h2>6. Acceptable use</h2>
      <p>You agree not to use the Service to:</p>
      <ul>
        <li>publish illegal, misleading, hateful, harassing, sexually explicit or infringing content;</li>
        <li>send spam or engage in artificial engagement or platform manipulation;</li>
        <li>impersonate any person or business;</li>
        <li>attempt to access other users' data, disrupt the Service, or reverse engineer it;</li>
        <li>break any law or any connected platform's rules.</li>
      </ul>
      <p>We may remove content or suspend accounts that break these rules.</p>

      <h2>7. Plans, payment and limits</h2>
      <ul>
        <li>Paid plans are billed in advance for the selected period. Prices and limits are shown on our <a routerLink="/" fragment="pricing">pricing</a> section.</li>
        <li>Each plan includes usage limits (for example brands, social accounts and AI generations). Some features stop when a limit is reached until the next period or an upgrade.</li>
        <li>Fees are non-refundable except where required by law. We will give notice before changing prices for your plan.</li>
      </ul>

      <h2>8. Availability</h2>
      <p>We aim to keep the Service available and reliable, but it is provided "as is" and "as available". We do not guarantee that every post will publish at an exact time, as delivery depends on third-party platforms.</p>

      <h2>9. Limitation of liability</h2>
      <p>To the maximum extent permitted by law, {{ l.company }} is not liable for indirect, incidental or consequential losses, or loss of profits, data or reputation. Our total liability for any claim is limited to the amount you paid us in the 3 months before the claim.</p>

      <h2>10. Termination</h2>
      <p>You can stop using the Service at any time and ask us to delete your account (see <a routerLink="/data-deletion">Data Deletion</a>). We may suspend or end your access if you break these Terms. Sections that by nature should survive termination will continue to apply.</p>

      <h2>11. Privacy</h2>
      <p>Our <a routerLink="/privacy-policy">Privacy Policy</a> explains how we handle your information.</p>

      <h2>12. Changes to these Terms</h2>
      <p>We may update these Terms. We will post the new version here with a new effective date. Continuing to use the Service after changes take effect means you accept them.</p>

      <h2>13. Governing law</h2>
      <p>These Terms are governed by the laws of {{ l.jurisdiction }}. Disputes will be subject to the exclusive jurisdiction of the courts of {{ l.jurisdiction }}.</p>

      <h2>14. Contact</h2>
      <div class="callout">
        <b>{{ l.company }}</b><br />
        {{ l.address }}<br />
        Email: <a [href]="'mailto:' + l.email">{{ l.email }}</a>
      </div>
    </app-legal-layout>
  `,
})
export class TermsPage {
  protected readonly l = LEGAL;
}
