# SocialPilot AI — Web app (Angular 22)

Standalone components, signals and zoneless change detection. The app talks **only** to the NestJS API (`/api/v1`); no third-party secrets live here.

```bash
npm install
npm start          # http://localhost:4200 — proxies /api and /uploads to http://localhost:3000 (proxy.conf.json)
npm run build      # production build → dist/web/browser
```

Structure:

```
src/app/
├── core/       api.service (envelope unwrapping), auth.service + interceptor (refresh rotation), guards,
│               brand-context (top-bar brand selector), notifications, toasts, models
├── shared/     icons, platform badges, status badge, modal, chart (Chart.js), media picker, AI image dialog, pipes
├── layout/     shell: sidebar navigation, brand selector, quick create, notifications, user menu
└── features/   auth, dashboard, brands, social-accounts (+ OAuth callback), media, posts (editor, previews, list),
                ai (AI Studio), calendar, campaigns, analytics, settings, subscription
```

Design tokens (primary `#0078B8`, secondary `#F57AA8`, background `#F7F9FC`) are in `src/styles.scss`.
