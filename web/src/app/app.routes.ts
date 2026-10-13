import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/guards';
import { Shell } from './layout/shell';

export const routes: Routes = [
  // Public landing page; signed-in users go straight to the dashboard (guestGuard).
  { path: '', pathMatch: 'full', canActivate: [guestGuard], loadComponent: () => import('./features/landing/landing.page').then((m) => m.LandingPage) },
  // Public legal pages (linked from Meta / Google app settings), open to everyone.
  { path: 'privacy-policy', title: 'Privacy Policy', loadComponent: () => import('./features/legal/privacy-policy.page').then((m) => m.PrivacyPolicyPage) },
  { path: 'terms', title: 'Terms of Service', loadComponent: () => import('./features/legal/terms.page').then((m) => m.TermsPage) },
  { path: 'data-deletion', title: 'Data Deletion', loadComponent: () => import('./features/legal/data-deletion.page').then((m) => m.DataDeletionPage) },
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage) },
  { path: 'register', canActivate: [guestGuard], loadComponent: () => import('./features/auth/register.page').then((m) => m.RegisterPage) },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', title: 'Dashboard', loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage) },
      { path: 'brands', title: 'Brands', loadComponent: () => import('./features/brands/brands.page').then((m) => m.BrandsPage) },
      { path: 'brands/new', title: 'Add brand', loadComponent: () => import('./features/brands/brand-form.page').then((m) => m.BrandFormPage) },
      { path: 'brands/:id/edit', title: 'Edit brand', loadComponent: () => import('./features/brands/brand-form.page').then((m) => m.BrandFormPage) },
      { path: 'social-accounts', title: 'Social accounts', loadComponent: () => import('./features/social-accounts/social-accounts.page').then((m) => m.SocialAccountsPage) },
      { path: 'social-accounts/callback', title: 'Connect account', loadComponent: () => import('./features/social-accounts/oauth-callback.page').then((m) => m.OAuthCallbackPage) },
      { path: 'media', title: 'Media library', loadComponent: () => import('./features/media/media.page').then((m) => m.MediaPage) },
      { path: 'posts', title: 'Posts', loadComponent: () => import('./features/posts/posts-list.page').then((m) => m.PostsListPage) },
      { path: 'posts/new', title: 'Create post', loadComponent: () => import('./features/posts/post-editor.page').then((m) => m.PostEditorPage) },
      { path: 'reels/new', title: 'Create reel', data: { reel: true }, loadComponent: () => import('./features/posts/post-editor.page').then((m) => m.PostEditorPage) },
      { path: 'posts/:id', title: 'Edit post', loadComponent: () => import('./features/posts/post-editor.page').then((m) => m.PostEditorPage) },
      { path: 'ai', title: 'AI Studio', loadComponent: () => import('./features/ai/ai-studio.page').then((m) => m.AiStudioPage) },
      { path: 'calendar', title: 'Content calendar', loadComponent: () => import('./features/calendar/calendar.page').then((m) => m.CalendarPage) },
      { path: 'campaigns', title: 'Campaigns', loadComponent: () => import('./features/campaigns/campaigns.page').then((m) => m.CampaignsPage) },
      { path: 'campaigns/:id', title: 'Campaign', loadComponent: () => import('./features/campaigns/campaign-detail.page').then((m) => m.CampaignDetailPage) },
      { path: 'analytics', title: 'Analytics', loadComponent: () => import('./features/analytics/analytics.page').then((m) => m.AnalyticsPage) },
      { path: 'settings', title: 'Settings', loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage) },
      { path: 'subscription', title: 'Subscription', loadComponent: () => import('./features/subscription/subscription.page').then((m) => m.SubscriptionPage) },
      { path: 'admin/subscriptions', title: 'Subscriptions', canActivate: [adminGuard], loadComponent: () => import('./features/admin/subscriptions.page').then((m) => m.AdminSubscriptionsPage) },
      { path: 'admin/ai-settings', title: 'AI providers', canActivate: [adminGuard], loadComponent: () => import('./features/admin/ai-settings.page').then((m) => m.AiSettingsPage) },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
