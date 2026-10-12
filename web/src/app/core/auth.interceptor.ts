import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

/**
 * Adds the bearer token and transparently refreshes it once on 401
 * (refresh-token rotation happens server side).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const isPublic = PUBLIC_AUTH_PATHS.some((p) => req.url.includes(p));
  const token = auth.accessToken;
  const authed = token && !isPublic ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authed).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401 || isPublic || !token) {
        if (err instanceof HttpErrorResponse && err.status === 401 && req.url.includes('/auth/refresh')) auth.clearAndRedirect();
        return throwError(() => err);
      }
      return auth.refresh().pipe(
        switchMap((newToken) => next(req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } }))),
        catchError((refreshErr: unknown) => {
          auth.clearAndRedirect();
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};
