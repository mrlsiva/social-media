# Production deployment

## Components

| Component | Notes |
|---|---|
| NestJS API (`backend/`) | Stateless; runs the HTTP API **and** the BullMQ workers. Scale horizontally. |
| Angular web (`web/`) | Static files; serve with nginx/CDN. Proxies `/api` and `/uploads` to the API (or point both at the API domain). |
| MySQL 8 / MariaDB 10.4+ | Managed DB recommended (RDS, Cloud SQL, DigitalOcean). Set `DATABASE_TYPE` accordingly. |
| Redis 7 | Required for publishing, scheduling, AI jobs. Use `maxmemory-policy noeviction` and persistence (AOF). |
| Storage | Local disk volume, or S3 (`STORAGE_DRIVER=s3`) — recommended in production because Instagram/Facebook fetch media by public URL. |

## Option A — Docker Compose (single server)

```bash
cp backend/.env.example backend/.env       # fill in secrets, APP_URL, WEB_APP_URL, OAuth + OpenAI keys
docker compose --profile app up -d --build
```
- Web: `:8080`, API: `:3000`, phpMyAdmin: `:8081` (don't expose phpMyAdmin publicly — restrict by firewall/VPN or remove the service).
- The API container runs `migration:run` on start (`RUN_MIGRATIONS=true`) and the idempotent seed (`RUN_SEED=true` in compose — set it to `false` after the first boot).
- Put a TLS-terminating reverse proxy (Caddy, Traefik, nginx + certbot) in front: `https://app.example.com` → web:80, and make sure `APP_URL=https://app.example.com` (the web nginx forwards `/api` and `/uploads`).
- Change `MYSQL_ROOT_PASSWORD` / `DATABASE_PASSWORD_APP` (export them before `docker compose up`).

## Option B — VM without Docker (PM2 + nginx)

```bash
# API
cd backend
npm ci && npm run build
npm run migration:run:prod && npm run seed:prod
npm i -g pm2
pm2 start dist/main.js --name socialpilot-api -i 2      # 2 instances; BullMQ coordinates workers
pm2 save && pm2 startup

# Web
cd ../web && npm ci && npx ng build --configuration production
sudo cp -r dist/web/browser/* /var/www/socialpilot/
```
Use [`docker/nginx.conf`](../docker/nginx.conf) as the site config (change `proxy_pass http://backend:3000` to `http://127.0.0.1:3000` and `root` to `/var/www/socialpilot`), then `certbot --nginx -d app.example.com`.

Install FFmpeg (`apt install ffmpeg`) so `ffprobe` can read video duration/dimensions.

## Production checklist

- [ ] `NODE_ENV=production`, strong unique `JWT_SECRET`, `JWT_REFRESH_SECRET`, `TOKEN_ENCRYPTION_KEY` (keep a secure backup of the encryption key — losing it means every social account must reconnect).
- [ ] `APP_URL` and `WEB_APP_URL` are the public HTTPS URLs; `CORS_ORIGINS` lists only your web origins.
- [ ] OAuth redirect URIs registered with Meta/Google/LinkedIn use the HTTPS API URL ([SOCIAL_OAUTH_SETUP.md](SOCIAL_OAUTH_SETUP.md)).
- [ ] Dedicated DB user with privileges on the app schema only; DB not reachable from the internet.
- [ ] Redis password (`REDIS_PASSWORD`) and private network.
- [ ] Media on S3 (+ CloudFront via `AWS_S3_PUBLIC_URL`) or a backed-up volume for `/app/uploads`.
- [ ] Change the seeded admin password (`admin@socialpilot.local`) or set `SEED_ADMIN_*` before seeding.
- [ ] Backups: nightly `mysqldump --single-transaction social_media_platform`, Redis AOF, uploads/S3 versioning.
- [ ] Monitoring: `GET /api/v1/health` (returns 503 when the DB is down; `redis: down` means jobs are paused), JSON logs (pino) shipped to your log stack.
- [ ] Rate limits (`THROTTLE_*`) tuned; consider a WAF/CDN in front.
- [ ] Run `npm audit` and keep dependencies updated.

## Scaling notes

- Run 2+ API instances behind a load balancer; no sticky sessions are needed (bearer tokens).
- BullMQ workers in every instance share the queues; job ids are unique per publishing job, so a platform is never published twice.
- The scheduler sweep job uses an atomic DB claim, so delayed jobs and the sweep never double-publish.
- For heavy AI/video load you can run dedicated worker instances (same image) and scale them independently.

## Upgrades

```bash
git pull
cd backend && npm ci && npm run build && npm run migration:run:prod && pm2 reload socialpilot-api
cd ../web && npm ci && npx ng build --configuration production   # deploy dist/web/browser
```
Generate new migrations in development with `npm run migration:generate -- src/database/migrations/<Name>` after changing entities, review the SQL, and commit them.
