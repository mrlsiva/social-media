# SocialPilot AI — Multi-brand AI Social Media Management SaaS

Create AI-generated posts and reels for **any number of brands** (e.g. *Sling Groups*, *Sling Billings*, *Crackers*) and publish or schedule them to **Instagram, Facebook, YouTube and LinkedIn** with one click — each platform succeeding, failing and retrying independently.

| Part | Tech |
|---|---|
| REST API (`backend/`) | NestJS 12 · TypeScript (strict) · TypeORM 1.x · MySQL 8 / MariaDB 10.4+ · BullMQ + Redis · JWT + rotating refresh tokens · Swagger |
| Web app (`web/`) | Angular 22 (standalone, signals, zoneless) · Chart.js |
| Mobile | Android/iOS apps consume the same `/api/v1` REST API — see [`mobile-api-docs/`](mobile-api-docs/README.md) |

---

## Contents

1. [Features](#features)
2. [Folder structure](#folder-structure)
3. [Installation](#installation)
4. [MySQL & phpMyAdmin](#mysql--phpmyadmin-setup)
5. [Environment variables](#environment-variables)
6. [Migrations & seed](#migrations--seed)
7. [Run the API](#run-the-api)
8. [Run the web app](#run-the-web-app)
9. [Redis / BullMQ](#redis--bullmq)
10. [Swagger](#swagger--api-documentation)
11. [API overview](#api-overview)
12. [Social OAuth](#social-oauth-configuration)
13. [Production](#production-deployment)
14. [Mobile](#mobile-app-integration)
15. [Testing](#testing)
16. [Architecture notes](#architecture-notes)
17. [Current limitations](#current-limitations)

---

## Features

- **Multi-brand workspace** — separate logo, colours, contact info, AI voice, social accounts, media library, posts, schedules, analytics and team members per brand. Brand isolation is enforced on every query (`BrandAccessService`); non-members get `BRAND_NOT_FOUND`.
- **One-click "Publish to All"** — one `publishing_jobs` row + one BullMQ job **per platform** (shared batch id). Live per-platform status (✅/❌), error details, step logs, retry a single job or "retry failed only". Never publishes twice to a destination that already succeeded.
- **Platform-specific publishers** (`backend/src/publishing/{instagram,facebook,youtube,linkedin}`) built on the official APIs: Instagram container flow (incl. resumable reel upload, JPEG conversion), Facebook photos/feed/videos/reels, YouTube resumable upload + Shorts + thumbnails + AI-content disclosure, LinkedIn Posts API (images, multi-image, chunked video, article links, correct hashtag/commentary escaping).
- **Content types** — image, carousel, video, reel (script, text overlays, voice-over text, subtitles, music preference, thumbnail).
- **AI** behind provider interfaces (`AiTextProvider`, `AIImageService`/`AiImageProvider`, `AIVideoService`/`AiVideoProvider`; OpenAI implementations included): captions, hashtags, post ideas, reel ideas, reel scripts, **natively different copy per platform**, branded images (logo/colours/name/CTA/website), async AI video (storyboard → render → poll → media library), AI campaign plans.
- **Media library** — per-brand folders, search, filters, preview, rename/move, magic-byte validated uploads (JPG/JPEG/PNG/WEBP/MP4/MOV), local storage today, S3 driver ready (`STORAGE_DRIVER=s3`).
- **Calendar** — month/week/day, drag & drop scheduling/rescheduling, edit/duplicate/delete.
- **Scheduling** — durable `scheduled_posts` rows + BullMQ delayed jobs, fan-out to per-platform jobs at publish time, a minute-by-minute sweep that recovers schedules lost from Redis, reminders 30 min before.
- **Campaigns** — e.g. *Diwali 2026 · 7 days* → AI drafts Day 1…Day 7 (intro, educational, benefit, problem, offer, reel, final CTA) as editable drafts → "Schedule all".
- **Analytics** — synced from each platform's insights API every 6 h (and on demand): impressions, reach, likes, comments, shares, saves, followers, engagement rate, video views; daily series, followers, platform comparison, best content; per user, brand, platform, post and campaign.
- **SaaS** — plans (Free/Starter/Business/Enterprise) and **limits stored in the database** (`usage_limits`), monthly AI usage counters, admin endpoints for plans and plan assignment (billing-webhook ready).
- **Security** — Helmet, CORS allow-list, rate limiting, DTO whitelisting + validation, HTML sanitisation, argon2id passwords, short-lived access JWT + rotating refresh tokens with replay detection, per-device sessions, RBAC (system roles/permissions + brand roles), single-use OAuth state + PKCE, AES-256-GCM encrypted social tokens, audit log, secret redaction in logs. No secrets ever reach Angular.

## Folder structure

```
social-media/
├── backend/                     NestJS REST API
│   ├── src/
│   │   ├── main.ts / app.module.ts / app.setup.ts
│   │   ├── config/              typed configuration + env validation (Joi)
│   │   ├── database/            TypeORM data source, migrations/, seeds/
│   │   ├── common/              errors, filters, envelope interceptor, guards, crypto, utils
│   │   ├── auth/                register/login/refresh/logout(-all), sessions, JWT strategy
│   │   ├── users/               users, roles, permissions
│   │   ├── brands/              brands, brand settings, members, BrandAccessService
│   │   ├── media/               media library, folders, storage/ (Local + S3), ffprobe processor
│   │   ├── posts/               posts, post_media, post_platforms, hashtags
│   │   ├── reels/               reel entities (reel = post with content_type "reel")
│   │   ├── social-accounts/     OAuth connect/callback/select, encrypted tokens, token refresh job
│   │   ├── publishing/          PublishingService, processor, publishers + SocialPublisher interface
│   │   │   ├── interfaces/  instagram/  facebook/  youtube/  linkedin/  meta/
│   │   ├── scheduler/           schedule/unschedule, delayed jobs, sweep & reminders
│   │   ├── campaigns/           campaigns + AI plan generation
│   │   ├── ai/                  text/image/video services, providers/openai, processor
│   │   ├── analytics/           insights sync, analytics + dashboard queries
│   │   ├── notifications/       in-app notifications API, push sender abstraction
│   │   ├── subscriptions/       plans, limits, subscriptions, UsageService
│   │   ├── audit/               audit_logs
│   │   └── health/              /health (DB + Redis)
│   ├── test/                    e2e tests
│   ├── .env.example
│   └── package.json
├── web/                         Angular web app
│   ├── src/app/{core,shared,layout,features/*}
│   └── proxy.conf.json          dev proxy → http://localhost:3000
├── mobile-api-docs/             Mobile integration guide + openapi.json
├── docs/                        SOCIAL_OAUTH_SETUP.md, DEPLOYMENT.md
├── docker/                      Dockerfiles, nginx.conf, entrypoint
├── docker-compose.yml           MySQL + Redis + phpMyAdmin (+ API & web with --profile app)
└── README.md
```

## Installation

Prerequisites: **Node.js 22+** (24 recommended), **MySQL 8** or **MariaDB 10.4+** (XAMPP works), **Redis 7** (for background jobs), optionally FFmpeg (`ffprobe`) and Docker.

```bash
git clone <repo> social-media && cd social-media

# API
cd backend
npm install
cp .env.example .env        # then edit .env (see below)

# Web
cd ../web
npm install
```

> npm 11 may print `allow-scripts` warnings — `argon2` and `sharp` ship prebuilt binaries, so no install scripts need to run.

## MySQL & phpMyAdmin setup

**Option A — XAMPP / WAMP / existing MySQL (phpMyAdmin)**
1. Start MySQL from the XAMPP control panel and open `http://localhost/phpmyadmin`.
2. *Databases → Create database*: name `social_media_platform`, collation `utf8mb4_unicode_ci`. (Or SQL tab: `CREATE DATABASE social_media_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`)
3. (Recommended) *User accounts → Add user account*: e.g. `socialpilot` with a password, grant **all privileges on `social_media_platform`** only.
4. In `backend/.env` set `DATABASE_TYPE=mariadb` for XAMPP's MariaDB (`mysql` for MySQL 8), plus host/port/user/password/name.
5. Run the migrations (next section). Tables then appear in phpMyAdmin. Plan limits can be edited directly in the `usage_limits` table.

phpMyAdmin is only an administration UI — the application never depends on it.

**Option B — Docker**: `docker compose up -d` starts MySQL 8.4 on `3306`, Redis on `6379` and **phpMyAdmin on http://localhost:8081** (login `root` / `rootpassword`, or the app user `socialpilot` / `socialpilot`).

## Environment variables

All variables live in `backend/.env` (template: [`backend/.env.example`](backend/.env.example)). **Never commit `.env`** (it is git-ignored).

| Variable | Required | Description |
|---|---|---|
| `APP_NAME`, `APP_PORT`, `APP_URL` | yes | API name, port (3000), public base URL. **`APP_URL` must be public HTTPS in production** — Instagram/Facebook download media from `APP_URL/uploads/...`. |
| `WEB_APP_URL`, `CORS_ORIGINS` | yes | Angular origin (OAuth return target) and extra CORS origins. |
| `DATABASE_TYPE` | yes | `mysql` (MySQL 8) or `mariadb` (MariaDB/XAMPP). |
| `DATABASE_HOST/PORT/USER/PASSWORD/NAME` | yes | MySQL connection. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | yes | ≥ 32 chars, different values. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | no | Default `15m` / `30d`. |
| `TOKEN_ENCRYPTION_KEY` | yes | 32 random bytes, base64 — encrypts social tokens. `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Changing it invalidates stored connections. |
| `AI_TEXT_PROVIDER`, `AI_IMAGE_PROVIDER`, `AI_VIDEO_PROVIDER` | no | Provider names (default `openai`). |
| `OPENAI_API_KEY`, `OPENAI_TEXT_MODEL`, `OPENAI_IMAGE_MODEL`, `OPENAI_VIDEO_MODEL` | for AI | Without a key, AI endpoints answer `503 AI_PROVIDER_NOT_CONFIGURED`. |
| `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `META_GRAPH_VERSION` | for FB/IG | Meta app (Facebook Login). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | for YouTube | Google OAuth client. |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI`, `LINKEDIN_API_VERSION`, `LINKEDIN_SCOPES` | for LinkedIn | `LINKEDIN_API_VERSION` is the `YYYYMM` header; keep it within LinkedIn's supported window. |
| `OAUTH_ALLOWED_RETURN_URLS` | no | Extra OAuth return targets, e.g. mobile deep link `socialpilot://oauth`. |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` | yes | BullMQ connection. |
| `STORAGE_DRIVER` | no | `local` (default) or `s3`. |
| `STORAGE_LOCAL_PATH`, `MAX_IMAGE_SIZE_MB`, `MAX_VIDEO_SIZE_MB` | no | Upload location and limits (10 MB / 500 MB). |
| `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_PUBLIC_URL` | for S3 | Objects must be publicly readable (bucket policy or CloudFront). |
| `FFPROBE_PATH` | no | ffprobe binary for video duration/dimensions. |
| `THROTTLE_TTL_SECONDS`, `THROTTLE_LIMIT` | no | Global rate limit (auth & AI routes have stricter limits). |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | no | Admin created by the seed. |
| `LOG_LEVEL` | no | pino level (`info`). Passwords, tokens and secrets are redacted. |

## Migrations & seed

```bash
cd backend
npm run migration:run          # create/upgrade schema (development, ts-node)
npm run seed                   # roles, permissions, plans + limits, admin user (idempotent)

npm run migration:show         # list applied/pending migrations
npm run migration:revert       # undo the last migration
npm run migration:generate -- src/database/migrations/<Name>   # after changing entities

# compiled (production / Docker)
npm run migration:run:prod
npm run seed:prod
```

`synchronize` is always off — the schema is managed only through migrations. The seed prints the admin login (default `admin@socialpilot.local` / `Admin@12345` — **change it**).

## Run the API

```bash
cd backend
npm run start:dev      # watch mode on http://localhost:3000/api/v1
npm run build && npm run start:prod
```

Health: `GET http://localhost:3000/api/v1/health` → `database: up`, `redis: up|down`. If Redis is down the API still serves requests (health reports *Degraded*); actions that need the queue return a clear `503` instead of hanging.

## Run the web app

```bash
cd web
npm start              # ng serve on http://localhost:4200 (proxies /api and /uploads to :3000)
npm run build          # production bundle in web/dist/web/browser
```

## Redis / BullMQ

Queues: `publishing` (one job per platform), `scheduled-posts` (delayed triggers + 1-minute sweep), `ai-generation` (images, video start/poll), `media-processing` (ffprobe), `analytics-sync` (every 6 h), `maintenance` (token refresh every 6 h), `notifications` (push delivery).

Install Redis:
- **Docker**: `docker compose up -d redis`
- **Windows**: [Memurai](https://www.memurai.com/) (Redis-compatible service) or Redis inside WSL (`sudo apt install redis-server && sudo service redis-server start`)
- **Linux/macOS**: `apt install redis-server` / `brew install redis`

Use `maxmemory-policy noeviction` in production (already set in docker-compose). Workers run inside the API process; to scale, run more API instances — BullMQ distributes jobs safely.

## Swagger / API documentation

- Swagger UI: **http://localhost:3000/api/docs**
- OpenAPI JSON: **http://localhost:3000/api/docs-json** (a snapshot is committed at [`mobile-api-docs/openapi.json`](mobile-api-docs/openapi.json))

Click **Authorize**, paste the `accessToken` from `POST /auth/login`. Every endpoint documents its body, envelope responses, errors, auth and pagination; uploads are documented as `multipart/form-data`.

## API overview

Base URL `/api/v1`, header `Authorization: Bearer <accessToken>`. Responses: `{ success, message, data, meta }`; errors: `{ success: false, message, error: { code } }`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register` · `/auth/login` · `/auth/refresh` · `/auth/logout` · `/auth/logout-all` · `GET /auth/me` · `GET /auth/sessions` · `DELETE /auth/sessions/:id` · `PUT /auth/sessions/current/push-token` · `POST /auth/change-password` |
| Users | `GET/PATCH /users/me` |
| Brands | `GET/POST /brands` · `GET/PATCH/DELETE /brands/:id` · `PUT /brands/:id/settings` · `GET/POST /brands/:id/members` · `PATCH/DELETE /brands/:id/members/:memberId` |
| Media | `GET/POST /brands/:brandId/media` · `POST /brands/:brandId/media/bulk` · `POST /brands/:brandId/logo` · `GET/PATCH/DELETE /media/:id` · `GET/POST /brands/:brandId/media-folders` · `PATCH/DELETE /media-folders/:id` |
| Posts & reels | `GET/POST /posts` · `GET /posts/calendar` · `GET/PATCH/DELETE /posts/:id` · `POST /posts/:id/duplicate` · `GET /brands/:brandId/hashtags` |
| Publishing | `POST /posts/:id/publish` · `POST /posts/:id/publish-all` · `POST /posts/:id/retry-failed` · `GET /posts/:id/publishing-status` · `POST /publishing/:jobId/retry` · `GET /publishing/jobs` · `GET /publishing/jobs/:jobId` |
| Scheduling | `POST/DELETE /posts/:id/schedule` · `GET /scheduled-posts` |
| Social accounts | `GET /social-accounts` · `GET /social-accounts/platforms` · `POST /social-accounts/:platform/connect` · `GET /social-accounts/:platform/callback` · `GET /social-accounts/oauth-sessions/:id` · `POST /social-accounts/oauth-sessions/:id/complete` · `POST /social-accounts/:id/validate` · `POST /social-accounts/:id/refresh-token` · `DELETE /social-accounts/:id` |
| AI | `POST /ai/caption` · `/ai/hashtags` · `/ai/post-ideas` · `/ai/reel-ideas` · `/ai/reel-script` · `/ai/platform-content` · `/ai/image` → `GET /ai/images/:jobId` (+ `/regenerate`, `/save`) · `POST /ai/videos` (alias `/ai/video`) → `GET /ai/videos/:jobId` · `GET /ai/generations` · `GET /ai/providers` |
| Campaigns | `GET/POST /campaigns` · `GET/PATCH/DELETE /campaigns/:id` · `POST /campaigns/:id/generate` · `POST /campaigns/:id/schedule-all` |
| Analytics | `GET /dashboard` · `GET /analytics` · `GET /brands/:brandId/analytics` · `GET /analytics/posts/:postId` · `GET /analytics/campaigns/:campaignId` · `POST /brands/:brandId/analytics/sync` |
| Notifications | `GET /notifications` · `GET /notifications/unread-count` · `PATCH /notifications/:id/read` · `POST /notifications/read-all` · `DELETE /notifications/:id` |
| Subscriptions | `GET /subscriptions/plans` · `GET /subscriptions/current` · admin: `GET/PUT /subscriptions/admin/plans`, `POST /subscriptions/admin/assign` |
| Health | `GET /health` |

Error codes include `AUTH_INVALID`, `TOKEN_EXPIRED`, `REFRESH_TOKEN_INVALID`, `BRAND_NOT_FOUND`, `BRAND_ACCESS_DENIED`, `SOCIAL_ACCOUNT_NOT_CONNECTED`, `SOCIAL_PLATFORM_NOT_CONFIGURED`, `MEDIA_UPLOAD_FAILED`, `MEDIA_INVALID_TYPE`, `MEDIA_TOO_LARGE`, `AI_GENERATION_FAILED`, `AI_PROVIDER_NOT_CONFIGURED`, `PUBLISH_FAILED`, `PLATFORM_API_ERROR`, `CONTENT_NOT_SUPPORTED`, `USAGE_LIMIT_REACHED`, `VALIDATION_FAILED`, `RATE_LIMITED` (full list: `backend/src/common/errors/error-codes.ts`). Request/response examples: [`mobile-api-docs/README.md`](mobile-api-docs/README.md).

## Social OAuth configuration

Step-by-step app setup for Meta (Facebook + Instagram), Google (YouTube) and LinkedIn — redirect URIs, scopes, app review and gotchas: **[docs/SOCIAL_OAUTH_SETUP.md](docs/SOCIAL_OAUTH_SETUP.md)**.

Connection flow: `POST /social-accounts/:platform/connect` → browser opens `authorizationUrl` → provider redirects to `/social-accounts/:platform/callback` → API validates the single-use state, exchanges the code server-side, then redirects to `returnUrl?status=success&session=<id>` → the client lists discovered Pages/channels/organizations and calls `/oauth-sessions/:id/complete` with the chosen ones. Tokens are encrypted and never returned.

## Production deployment

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** (Docker Compose, bare-metal with PM2 + nginx, HTTPS, S3, scaling, backups, security checklist).

Quick start with Docker: `docker compose --profile app up -d --build` → web on `http://localhost:8080`, API on `:3000`, phpMyAdmin on `:8081`. Migrations run automatically on container start.

## Mobile app integration

Guide for Android/iOS (auth & refresh, device sessions, push tokens, uploads, OAuth with deep links, publishing status polling, error handling, examples): **[mobile-api-docs/README.md](mobile-api-docs/README.md)**.

## Testing

```bash
cd backend
npm test                 # unit/service/controller tests (Jest) - all third-party APIs mocked
npm run test:cov         # with coverage
npm run test:e2e         # boots the full app against the DB in .env - point DATABASE_NAME at a dedicated test database (it creates users)
npm run typecheck
```

Suites: auth service (argon2, refresh rotation & replay detection), encryption, publishing service (fan-out, partial failure, retries, idempotency, token-expiry handling, no tokens in logs), publishing controller, Instagram publisher (container flow, resumable upload, validation), content adaptation & LinkedIn escaping, AI text service (mocked provider), file-type sniffing & timezone utils, e2e auth/brand isolation. No test ever calls a real social or AI API.

Web: `cd web && npm run build` (strict template type-checking).

## Architecture notes

- **One backend for web & mobile** — the Angular app is just another API client (bearer tokens, no cookies). There is no web-only business logic.
- **Adding a platform** (X, TikTok, Pinterest, Threads): implement `SocialPublisher` (`backend/src/publishing/interfaces/social-publisher.interface.ts`), register it in `publishers.module.ts`. The `platform` columns are `VARCHAR`, so no migration is needed.
- **Adding an AI provider**: implement `AiTextProvider` / `AiImageProvider` / `AiVideoProvider` and add it to the `select()` registry in `ai.module.ts`; switch with `AI_*_PROVIDER`.
- **Moving to S3**: set `STORAGE_DRIVER=s3` + `AWS_*`. Existing local files must be copied to the bucket with the same keys (`brands/<brandId>/...`) and `media.url`/`storage_driver` updated.
- **Multi-tenancy** — account (user) → owns brands → brand members with roles (owner/admin/editor/viewer); plans/limits attach to the brand owner's subscription.

## Current limitations

Being explicit about what is and isn't wired up in this codebase:

- **Social publishing needs your own developer apps** (Meta, Google, LinkedIn). Without credentials, connect buttons are disabled and publishing reports `SOCIAL_PLATFORM_NOT_CONFIGURED` — nothing is ever reported as published unless the platform API confirmed it.
- Instagram/Facebook fetch images by URL → in production `APP_URL` (or the S3 public URL) must be reachable over HTTPS. Videos fall back to direct (resumable) upload when the URL isn't public.
- YouTube uploads from unaudited Google projects are forced to **private** by YouTube until the project passes the YouTube API compliance audit. LinkedIn company pages need Community Management API approval; LinkedIn member tokens last ~60 days (refresh tokens only for approved partners).
- Insights metric names change between Graph API versions; post-level reach/impressions for Facebook are fetched best-effort, engagement counts always.
- AI video uses OpenAI Sora (4/8/12 s clips). The storyboard (scenes, overlays, voice-over, subtitles SRT, music) is generated and passed to the renderer; burning overlays/subtitles into an uploaded video would need an FFmpeg pipeline (the `media-processing` queue is the place to add it).
- Payments are not integrated — plans are assigned by an admin endpoint designed to be called from a Stripe/Razorpay webhook. Mobile push delivery uses a `PushSender` abstraction with a no-op default (plug in FCM/APNs).
