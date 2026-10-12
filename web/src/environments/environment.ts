/**
 * The web app only talks to the NestJS API. In development `ng serve` proxies
 * /api and /uploads to http://localhost:3000 (proxy.conf.json); in production
 * nginx does the same (docker/nginx.conf). No third-party secrets live here.
 */
export const environment = {
  apiUrl: '/api/v1',
  appName: 'SocialPilot AI',
};
