import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiEnvelope, PageMeta, Paged } from './models';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

type Params = Record<string, string | number | boolean | null | undefined>;

/**
 * Thin client over the NestJS REST API. Unwraps the `{ success, data, meta }`
 * envelope and normalises errors to ApiRequestError (message + stable code).
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  readonly baseUrl = environment.apiUrl;

  get<T>(path: string, params?: Params): Observable<T> {
    return this.unwrap(this.http.get<ApiEnvelope<T>>(this.url(path), { params: this.params(params) }));
  }

  list<T>(path: string, params?: Params): Observable<Paged<T>> {
    return this.http.get<ApiEnvelope<T[]>>(this.url(path), { params: this.params(params) }).pipe(
      map((res) => ({ items: res.data, meta: res.meta as unknown as PageMeta })),
      catchError((err) => this.toError(err)),
    );
  }

  post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.unwrap(this.http.post<ApiEnvelope<T>>(this.url(path), body));
  }

  put<T>(path: string, body: unknown = {}): Observable<T> {
    return this.unwrap(this.http.put<ApiEnvelope<T>>(this.url(path), body));
  }

  patch<T>(path: string, body: unknown = {}): Observable<T> {
    return this.unwrap(this.http.patch<ApiEnvelope<T>>(this.url(path), body));
  }

  delete<T = null>(path: string): Observable<T> {
    return this.unwrap(this.http.delete<ApiEnvelope<T>>(this.url(path)));
  }

  upload<T>(path: string, form: FormData): Observable<T> {
    return this.unwrap(this.http.post<ApiEnvelope<T>>(this.url(path), form));
  }

  private url(path: string): string {
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private params(params?: Params): HttpParams {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
    }
    return p;
  }

  private unwrap<T>(obs: Observable<ApiEnvelope<T>>): Observable<T> {
    return obs.pipe(
      map((res) => res.data),
      catchError((err) => this.toError(err)),
    );
  }

  private toError(err: unknown): Observable<never> {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { message?: string; error?: { code?: string; details?: unknown } } | null;
      const message =
        err.status === 0
          ? 'Cannot reach the server. Check your connection.'
          : Array.isArray(body?.error?.details)
            ? (body!.error!.details as string[]).join(', ')
            : body?.message ?? err.message;
      return throwError(() => new ApiRequestError(message, body?.error?.code ?? 'HTTP_ERROR', err.status, body?.error?.details));
    }
    return throwError(() => err);
  }
}
