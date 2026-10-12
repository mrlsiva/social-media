# Mobile App Integration Guide (Android & iOS)

The mobile apps use **exactly the same REST API** as the Angular web app. There is no mobile-specific business logic. Everything below is available today at `/api/v1`.

- Interactive docs: `https://<api-host>/api/docs` · OpenAPI 3 spec: [`openapi.json`](openapi.json) (generate Retrofit/Ktor/Swift clients with `openapi-generator`)
- Base URL: `https://<api-host>/api/v1`
- Content type: `application/json` (uploads: `multipart/form-data`)
- Auth header: `Authorization: Bearer <accessToken>`. **No cookies are used.**

---

## 1. Response envelope

Success:
```json
{ "success": true, "message": "Post saved as draft", "data": { }, "meta": { } }
```
Paginated lists (`?page=1&limit=20`, max `limit` 100):
```json
{ "success": true, "message": "OK", "data": [ ], "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 } }
```
Error (always):
```json
{ "success": false, "message": "Your plan allows 1 brands. Upgrade your subscription to continue.",
  "error": { "code": "USAGE_LIMIT_REACHED", "details": { "metric": "brands", "limit": 1, "used": 1 } } }
```
Switch on `error.code` (stable), show `message` to users. Validation errors put field messages in `error.details` (array of strings).

| HTTP | Typical codes | Client action |
|---|---|---|
| 400 | `VALIDATION_FAILED`, `POST_INVALID_STATE`, `MEDIA_INVALID_TYPE`, `CONTENT_NOT_SUPPORTED` | Show message, fix input |
| 401 | `TOKEN_EXPIRED` | Refresh once, retry the request |
| 401 | `AUTH_INVALID`, `REFRESH_TOKEN_INVALID` | Clear tokens → login screen |
| 402 | `USAGE_LIMIT_REACHED` | Show upgrade prompt (`error.details.metric`) |
| 403 | `BRAND_ACCESS_DENIED`, `FORBIDDEN` | Hide/disable the action for this role |
| 404 | `BRAND_NOT_FOUND`, `POST_NOT_FOUND`, `MEDIA_NOT_FOUND`, … | Item gone or not shared with this user |
| 409 | `AUTH_EMAIL_TAKEN`, `CONFLICT` | Show message |
| 413 | `MEDIA_TOO_LARGE` | Compress / trim the file |
| 429 | `RATE_LIMITED` | Back off and retry later |
| 502/503 | `PLATFORM_API_ERROR`, `AI_GENERATION_FAILED`, `AI_PROVIDER_NOT_CONFIGURED`, `SOCIAL_PLATFORM_NOT_CONFIGURED` | Show message; retry later |

## 2. Authentication & device sessions

Every login creates a **session per device**. Send a stable `deviceId` (generate a UUID on first launch and persist it), a readable `deviceName` and `platform` (`android` | `ios`).

```http
POST /api/v1/auth/login
{ "email": "owner@slinggroups.com", "password": "Str0ngPassw0rd",
  "deviceId": "android-6f1c2a", "deviceName": "Pixel 9", "platform": "android" }
```
```json
{
  "success": true, "message": "Logged in",
  "data": {
    "user": { "id": "a5cafb39-…", "email": "owner@slinggroups.com", "firstName": "Priya", "lastName": "Sharma",
              "avatarUrl": null, "phone": null, "timezone": "UTC", "roles": ["user"], "createdAt": "2026-10-07T18:48:37.145Z" },
    "tokens": { "accessToken": "eyJhbGciOi…", "refreshToken": "eyJhbGciOi…", "tokenType": "Bearer",
                "expiresIn": 900, "refreshExpiresIn": 2592000 },
    "sessionId": "99e1dbda-d07b-4725-91d8-03cbcf9f0384"
  },
  "meta": {}
}
```
`POST /auth/register` takes `firstName`, `lastName?`, `email`, `password` (8+ chars, upper + lower case + digit), `timezone?` and the same device fields, and returns the same payload. New accounts start on the Free plan.

**Token storage**: keep the refresh token in Android **EncryptedSharedPreferences/Keystore** or the iOS **Keychain** (never plain prefs/UserDefaults). The access token (15 min) can stay in memory.

**Refresh with rotation**:
```http
POST /api/v1/auth/refresh
{ "refreshToken": "<current refresh token>" }
```
Returns a **new** access + refresh token pair. The old refresh token becomes invalid; presenting it again is treated as theft and **revokes that device session**. So:
- Run only **one** refresh at a time (single-flight mutex in your HTTP interceptor/authenticator: OkHttp `Authenticator`, Alamofire `RequestInterceptor`).
- Persist the new refresh token **before** retrying the queued requests.
- On `401 REFRESH_TOKEN_INVALID` → clear storage, go to login.

| Endpoint | Purpose |
|---|---|
| `POST /auth/logout` | Log out this device |
| `POST /auth/logout-all` | Log out every device (incl. this one) |
| `GET /auth/sessions` | List devices (`current: true` marks this one) |
| `DELETE /auth/sessions/:id` | Sign out another device |
| `PUT /auth/sessions/current/push-token` `{ "pushToken": "<FCM/APNs token>" }` | Register this device for push |
| `POST /auth/change-password` | Signs out all other devices |
| `GET /auth/me`, `GET/PATCH /users/me` | Profile |

## 3. Brands (workspace switcher)

`GET /brands?page=1&limit=100` lists brands the user belongs to, with `role` (`owner|admin|editor|viewer`) and `settings`. Keep the selected `brandId` locally; every content call takes it explicitly. Viewers can read but not create; editors create/publish; admins manage settings, accounts and members.

## 4. Media uploads

```http
POST /api/v1/brands/{brandId}/media
Content-Type: multipart/form-data
file=<binary>  (JPG/JPEG/PNG/WEBP ≤ 10 MB, MP4/MOV ≤ 500 MB)
folderId=<uuid>   (optional)   name=<string> (optional)   tags=diwali,offer (optional)
```
Returns the media object (`id`, `url`, `mimeType`, `width`, `height`, `sizeBytes`…). The server validates the real file content (magic bytes), not just the extension. Use the returned `id` in posts. For large videos use a background upload (Android WorkManager / iOS `URLSession` background task).

## 5. Create, publish and schedule posts

```http
POST /api/v1/posts
{
  "brandId": "fb45adb2-…",
  "contentType": "image",                  // image | carousel | video | reel
  "title": "Diwali offer",
  "caption": "Light up your business this Diwali!",
  "hashtags": ["diwali", "smallbusiness"],
  "cta": "Book a free call",
  "linkUrl": "https://slinggroups.example/diwali",
  "mediaIds": ["<media id>"],
  "platforms": [
    { "socialAccountId": "<instagram account id>" },
    { "socialAccountId": "<linkedin account id>", "captionOverride": "Professional version…", "options": { "visibility": "PUBLIC" } },
    { "socialAccountId": "<youtube account id>", "titleOverride": "Diwali offer", "options": { "privacyStatus": "public" } }
  ],
  "reel": { "script": { "hook": "…", "mainContent": "…", "cta": "…", "ending": "…" }, "textOverlays": [], "voiceOverEnabled": false }   // reels only
}
```
`GET /social-accounts?brandId=…` returns the connectable accounts (`status: connected|expired|revoked|error`).

**Publish to All** (every platform on the post, each as an independent job):
```http
POST /api/v1/posts/{id}/publish-all          → 202
```
```json
{ "success": true, "message": "Publishing to all platforms started",
  "data": { "batchId": "…", "postId": "…",
            "jobs": [ { "jobId": "…", "postPlatformId": "…", "platform": "instagram", "accountName": "Sling Groups", "status": "pending" },
                      { "jobId": "…", "postPlatformId": "…", "platform": "linkedin",  "accountName": "Sling Groups", "status": "failed" } ],
            "skipped": [ { "postPlatformId": "…", "platform": "linkedin", "reason": "LinkedIn connection for \"Sling Groups\" expired. Reconnect it and retry.", "errorCode": "TOKEN_EXPIRED" } ] },
  "meta": {} }
```
(The example shows the shape; one platform failing never fails the others.)

Publish only selected platforms: `POST /posts/{id}/publish` with `{ "targets": ["<postPlatformId or socialAccountId>", …] }`.

**Poll the status** every 3-5 s while any platform is `queued`/`publishing`:
```http
GET /api/v1/posts/{id}/publishing-status
```
```json
{ "success": true, "data": { "postId": "…", "status": "partially_published",
  "platforms": [
    { "postPlatformId": "…", "platform": "instagram", "accountName": "Sling Groups", "status": "published",
      "platformPostUrl": "https://www.instagram.com/p/…/", "errorCode": null, "errorMessage": null, "latestJobId": "…", "attempts": 1, "publishedAt": "…" },
    { "postPlatformId": "…", "platform": "facebook", "status": "failed", "errorCode": "PLATFORM_API_ERROR",
      "errorMessage": "Meta Graph API error (400): …", "latestJobId": "…", "attempts": 3 } ] } }
```
Retry: `POST /publishing/{latestJobId}/retry` (one platform) or `POST /posts/{id}/retry-failed` (all failed). Step-by-step log: `GET /publishing/jobs/{jobId}`.

**Schedule** (or reschedule):
```http
POST /api/v1/posts/{id}/schedule
{ "scheduledAt": "2026-10-10T04:30:00.000Z", "timezone": "Asia/Kolkata" }
```
Always send ISO-8601 instants (UTC or with offset). Cancel: `DELETE /posts/{id}/schedule`. Upcoming list: `GET /scheduled-posts?brandId=…`. Calendar data: `GET /posts/calendar?brandId=…&from=…&to=…` (≤ 93 days).

Post statuses: `draft`, `scheduled`, `publishing`, `published`, `partially_published`, `failed`, `cancelled`. Platform statuses: `pending`, `queued`, `publishing`, `published`, `failed`.

## 6. Connecting social accounts from the app (OAuth)

1. Ask the server admin to add your deep link to `OAUTH_ALLOWED_RETURN_URLS` (e.g. `socialpilot://oauth`).
2. `POST /social-accounts/{platform}/connect` with `{ "brandId": "…", "returnUrl": "socialpilot://oauth" }` → `{ authorizationUrl }`.
3. Open `authorizationUrl` in **Chrome Custom Tabs** (Android) or **ASWebAuthenticationSession** (iOS) — never an embedded WebView (Google and Meta block it).
4. After consent the server finishes the exchange and redirects to `socialpilot://oauth?status=success&session=<id>&platform=instagram` (or `status=error&error=OAUTH_FAILED&message=…`).
5. `GET /social-accounts/oauth-sessions/{session}` → the discovered Pages/channels/organizations (`key`, `accountName`, `profileImageUrl`, `alreadyConnected`).
6. `POST /social-accounts/oauth-sessions/{session}/complete` with `{ "accountKeys": ["…"] }`.

The app never sees access tokens or passwords. `GET /social-accounts/platforms` says which platforms are configured on the server.

## 7. AI features

Synchronous (a few seconds): `POST /ai/caption`, `/ai/hashtags`, `/ai/post-ideas`, `/ai/reel-ideas`, `/ai/reel-script`, `/ai/platform-content`. Each returns `{ generationId, result }`. Body = brief: `brandId`, `topic`, `productService`, `targetAudience`, `language`, `tone`, `objective`, `offer`, `additionalInstructions` (+ endpoint options such as `variants`, `count`, `platforms`).

Asynchronous jobs — never block the UI:
```http
POST /api/v1/ai/image   → 202 { "jobId": "…", "status": "processing" }
GET  /api/v1/ai/images/{jobId}   → { "status": "completed", "images": [ { "index": 0, "url": "…", "mediaId": null } ] }
POST /api/v1/ai/images/{jobId}/save { "index": 0 }   → media item for posts

POST /api/v1/ai/videos  → 202 { "jobId": "…", "status": "processing" }
GET  /api/v1/ai/videos/{jobId}   → { "status": "processing", "progress": 40 } … { "status": "completed", "videoUrl": "…", "mediaId": "…" }
```
Poll every 3 s (images) / 5-10 s (video), or wait for the `video_generation_completed` notification. AI calls count against monthly quotas (`402 USAGE_LIMIT_REACHED`).

## 8. Notifications

`GET /notifications?unreadOnly=true`, `GET /notifications/unread-count` (badge), `PATCH /notifications/{id}/read`, `POST /notifications/read-all`. Types: `publish_success`, `publish_failed`, `scheduled_reminder`, `ai_generation_completed`, `video_generation_completed`, `token_expired`. `data` holds deep-link ids (`postId`, `generationId`, `socialAccountId`). Push delivery uses the token registered via `PUT /auth/sessions/current/push-token` once the server's push provider is configured.

## 9. Dashboard, analytics, plans

`GET /dashboard?brandId=…`, `GET /analytics?brandId=…&from=2026-09-01&to=2026-10-07&platform=instagram`, `GET /analytics/posts/{postId}`, `GET /analytics/campaigns/{id}`, `GET /subscriptions/current` (plan + live usage per metric).

## 10. Example: curl walkthrough

```bash
API=http://localhost:3000/api/v1
TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"owner@slinggroups.com","password":"Str0ngPassw0rd","deviceId":"cli-1","platform":"android"}' | jq -r .data.tokens.accessToken)

BRAND=$(curl -s -X POST $API/brands -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Sling Groups","website":"https://slinggroups.example"}' | jq -r .data.id)

MEDIA=$(curl -s -X POST $API/brands/$BRAND/media -H "Authorization: Bearer $TOKEN" -F file=@promo.jpg | jq -r .data.id)

POST=$(curl -s -X POST $API/posts -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"brandId\":\"$BRAND\",\"contentType\":\"image\",\"caption\":\"Hello!\",\"mediaIds\":[\"$MEDIA\"],\"platforms\":[{\"socialAccountId\":\"<id>\"}]}" | jq -r .data.id)

curl -s -X POST $API/posts/$POST/publish-all -H "Authorization: Bearer $TOKEN" | jq
curl -s $API/posts/$POST/publishing-status -H "Authorization: Bearer $TOKEN" | jq
```

## 11. Conventions

- IDs are UUID strings. Dates are ISO-8601 UTC strings.
- All list endpoints are paginated (`page`, `limit`) and most accept `search` and `order=ASC|DESC`.
- Rate limits: 120 req/min per IP by default; login/register 10/min; AI 30/min.
- The API is versioned in the path (`/api/v1`). Breaking changes will ship as `/api/v2`.
