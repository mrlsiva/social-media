import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LegalLayout } from './legal-layout';
import { LEGAL } from './legal.config';

@Component({
  selector: 'app-privacy-policy-page',
  imports: [LegalLayout, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-legal-layout title="Privacy Policy">
      <p>This Privacy Policy explains how {{ l.company }} ("we", "us", "our") collects, uses, shares and protects information when you use {{ l.product }} at <a [href]="l.website">{{ l.website }}</a> (the "Service"). By using the Service you agree to this policy.</p>

      <h2>1. Information we collect</h2>
      <h3>Information you give us</h3>
      <ul>
        <li><b>Account details:</b> your name, email address and password. Passwords are stored only as a secure one-way hash.</li>
        <li><b>Brand details:</b> business name, logo, colours, website, contact email, phone, address, timezone and brand voice settings that you enter.</li>
        <li><b>Content:</b> posts, captions, hashtags, images, videos, campaigns and schedules you create or upload.</li>
        <li><b>Team details:</b> email addresses of colleagues you invite to a brand.</li>
      </ul>

      <h3>Information from social platforms you connect</h3>
      <p>When you choose to connect an account, you sign in on the platform's own official page. <b>We never see or store your social media passwords.</b> With your permission, the platform gives us:</p>
      <ul>
        <li><b>Facebook:</b> the Pages you manage (name, ID, profile picture) and a Page access token so we can publish posts and read Page insights.</li>
        <li><b>Instagram:</b> your Instagram Business or Creator account (username, ID, profile picture), linked Facebook Page, and an access token so we can publish content and read insights.</li>
        <li><b>YouTube:</b> your channel name, ID and thumbnail, and an access token so we can upload videos and read basic channel information.</li>
        <li><b>LinkedIn:</b> your name, profile ID and picture, and an access token so we can publish posts to your profile or pages you administer.</li>
        <li><b>Analytics:</b> reach, impressions, engagement and follower counts for content published through the Service.</li>
      </ul>

      <h3>Information collected automatically</h3>
      <ul>
        <li>Log data such as IP address, browser type, device information and the pages you visit, used for security and troubleshooting.</li>
        <li>Essential browser storage needed to keep you signed in. We do not use advertising or third-party tracking cookies.</li>
      </ul>

      <h2>2. How we use your information</h2>
      <ul>
        <li>To provide the Service: create, schedule and publish content to the accounts you connect, and show you analytics.</li>
        <li>To generate AI content (captions, hashtags, images and videos) from the prompts and brand details you provide.</li>
        <li>To manage your account, plan and usage limits, and to send service notifications.</li>
        <li>To keep the Service secure, prevent abuse and fix problems.</li>
        <li>To comply with legal obligations.</li>
      </ul>
      <p>We use data from connected platforms <b>only</b> to provide the features you request. We do not sell your data, use it for advertising, or use it to train AI models.</p>

      <h2>3. How we share information</h2>
      <p>We share information only as needed to run the Service:</p>
      <ul>
        <li><b>Social platforms</b> (Meta, Google/YouTube, LinkedIn): when you publish, we send your content to the platform you selected.</li>
        <li><b>AI providers</b> (for example OpenAI): your prompts and brand details are sent to generate content. They are not used to train the provider's models under our agreement.</li>
        <li><b>Hosting and storage providers</b> that store data on our behalf under confidentiality obligations.</li>
        <li><b>Your team:</b> members you invite to a brand can see that brand's content and connected accounts.</li>
        <li><b>Legal reasons:</b> if required by law, or to protect the rights, safety and property of our users or others.</li>
      </ul>

      <h2>4. Google and YouTube data</h2>
      <p>Our use of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener">Google API Services User Data Policy</a>, including the Limited Use requirements. The Service uses YouTube API Services; by connecting YouTube you also agree to the <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Google Privacy Policy</a>. You can revoke our access at any time from your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">Google security settings</a>.</p>

      <h2>5. Data security</h2>
      <ul>
        <li>Social media access tokens are encrypted at rest using AES-256-GCM.</li>
        <li>All traffic to the Service is encrypted with HTTPS.</li>
        <li>Access to production systems is restricted to authorised personnel.</li>
      </ul>
      <p>No system is perfectly secure, but we work hard to protect your information and will notify you of any breach as required by law.</p>

      <h2>6. Data retention</h2>
      <ul>
        <li>We keep your account data while your account is active.</li>
        <li>When you disconnect a social account, its access tokens are deleted immediately.</li>
        <li>When you ask us to delete your account, we delete your personal data within {{ l.deletionDays }} days, except where we must keep it to meet legal obligations.</li>
      </ul>

      <h2>7. Your rights and choices</h2>
      <p>You can access and update your information in the app at any time. You may also ask us to access, correct, export or delete your personal data, or withdraw consent, by emailing <a [href]="'mailto:' + l.email">{{ l.email }}</a>. See our <a routerLink="/data-deletion">Data Deletion</a> page for step-by-step instructions. We process personal data in line with applicable law, including India's Digital Personal Data Protection Act, 2023.</p>

      <h2>8. Children</h2>
      <p>The Service is intended for businesses and is not directed at children under 18. We do not knowingly collect data from children.</p>

      <h2>9. Changes to this policy</h2>
      <p>We may update this policy from time to time. We will post the new version on this page with a new effective date and, for significant changes, notify you by email or in the app.</p>

      <h2>10. Contact us</h2>
      <div class="callout">
        <b>{{ l.company }}</b><br />
        {{ l.address }}<br />
        Email: <a [href]="'mailto:' + l.email">{{ l.email }}</a>
      </div>
    </app-legal-layout>
  `,
})
export class PrivacyPolicyPage {
  protected readonly l = LEGAL;
}
