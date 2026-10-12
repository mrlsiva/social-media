# Social OAuth configuration

The platform only uses **official APIs and OAuth**. Users never give us their passwords; access tokens are stored AES-256-GCM encrypted and are never returned by the API.

Callback URLs (replace the host with your public API URL in production — must be HTTPS):

| Platform | Callback URL | Env vars |
|---|---|---|
| Facebook + Instagram (one Meta app) | `https://api.example.com/api/v1/social-accounts/facebook/callback` | `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `META_GRAPH_VERSION` |
| YouTube | `https://api.example.com/api/v1/social-accounts/youtube/callback` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| LinkedIn | `https://api.example.com/api/v1/social-accounts/linkedin/callback` | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI`, `LINKEDIN_API_VERSION`, `LINKEDIN_SCOPES` |

Instagram uses the same Meta app and `META_REDIRECT_URI` as Facebook; the callback works out which platform started the flow from the one-time `state`. For local development `http://localhost:3000/...` is accepted by Meta (development mode), Google and LinkedIn.

After editing `.env`, restart the API. `GET /api/v1/social-accounts/platforms` shows `configured: true` for each platform that is ready.

---

## Meta — Facebook Pages & Instagram professional accounts

1. https://developers.facebook.com → **My Apps → Create app** → type **Business**.
2. Add the **Facebook Login for Business** product (or Facebook Login). Under *Settings → Valid OAuth Redirect URIs* add the callback above.
3. *App settings → Basic*: copy **App ID** / **App Secret** → `META_APP_ID`, `META_APP_SECRET`. Add your Privacy Policy URL and app domain.
4. Permissions requested by the app:
   - Facebook: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `read_insights`, `business_management`
   - Instagram: `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, `business_management`
5. In development mode only app roles (admins/developers/testers) can connect. To go live, complete **Business Verification** and **App Review** for the permissions above (Meta requires screencasts of the publish flow).
6. `META_GRAPH_VERSION` defaults to `v25.0`. Meta retires versions after roughly 2 years; bump it when the dashboard warns you.

Requirements & gotchas:
- Instagram must be a **Professional (Business or Creator) account linked to a Facebook Page** the user manages; personal accounts cannot be published to via API.
- Instagram downloads images from a **public HTTPS URL** and accepts **JPEG only** (the API converts PNG/WEBP to JPEG automatically). In production set `APP_URL` to your public domain or use S3/CloudFront. Videos/reels fall back to direct resumable upload when the URL isn't public.
- Instagram: max 100 API-published posts per 24 h per account; captions ≤ 2,200 chars; ≤ 30 hashtags; carousels 2-10 items; image aspect ratio 4:5 – 1.91:1. Feed videos are published as Reels.
- Facebook Reels: max 30 API-published reels per 24 h per Page.
- Page tokens obtained from a long-lived user token don't expire, but they are invalidated when the user changes password, removes the app or loses Page access → the account shows *Expired* and admins get a `token_expired` notification.

## Google — YouTube

1. https://console.cloud.google.com → create a project.
2. **APIs & Services → Library**: enable **YouTube Data API v3**.
3. **OAuth consent screen**: External, add scopes `https://www.googleapis.com/auth/youtube.upload` and `https://www.googleapis.com/auth/youtube.readonly`, add test users while in testing.
4. **Credentials → Create credentials → OAuth client ID → Web application**; add the callback to *Authorized redirect URIs*. Copy client id/secret → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
5. The flow uses PKCE, `access_type=offline` and `prompt=consent`, so a refresh token is stored and access tokens refresh automatically.

Gotchas:
- `youtube.upload` is a **restricted/sensitive scope** → Google verification is required for production use.
- Videos uploaded by **unaudited API projects are locked to private**. Submit the [YouTube API compliance audit](https://support.google.com/youtube/contact/yt_api_form) to publish publicly.
- Quota: 10,000 units/day by default; uploads are expensive. A `quotaExceeded` error is retried later by the queue.
- Custom thumbnails need a verified channel (otherwise the upload succeeds and the thumbnail step is logged and skipped).
- Shorts: vertical video ≤ 3 minutes; `#Shorts` is added to the title automatically for reels.

## LinkedIn

1. https://www.linkedin.com/developers/apps → **Create app** (needs a LinkedIn Page to associate).
2. **Products**: add **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn** (member posting, scope `w_member_social`).
3. For **company pages**, request the **Community Management API** product (manual approval). Then set
   `LINKEDIN_SCOPES=openid profile w_member_social w_organization_social r_organization_social rw_organization_admin`.
4. **Auth** tab: add the callback to *Authorized redirect URLs*; copy client id/secret.
5. `LINKEDIN_API_VERSION` is sent as the `LinkedIn-Version: YYYYMM` header. LinkedIn supports each version for about a year — keep it recent.

Gotchas:
- Member access tokens last ~60 days; refresh tokens are only issued to approved partners. When a token expires the account is marked *Expired* and the user reconnects.
- Posts support single image, multi-image (2-20), a single video, or an article link (when there is no media). Commentary is ≤ 3,000 chars; reserved characters are escaped and hashtags are converted to LinkedIn hashtag entities automatically.

## Adding X, TikTok, Pinterest or Threads

Each needs its own developer app and review. Implement `SocialPublisher` (`backend/src/publishing/interfaces/social-publisher.interface.ts`), register it in `backend/src/publishing/publishers.module.ts`, add env vars and a callback URL. The UI lists these platforms as *Coming soon* until a publisher is registered.
