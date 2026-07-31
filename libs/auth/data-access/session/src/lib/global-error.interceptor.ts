import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { EMPTY, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { SessionService } from './session.service';
import { ENVIRONMENT_TOKEN } from './environment.token';
import { resolveAuthApp, resolveAuthReturnUrl } from './resolve-auth-app';

/**
 * Guard to prevent duplicate 401 redirects when multiple concurrent requests
 * fail simultaneously. Reset to false after navigation completes.
 */
let redirectingToLogin = false;

/**
 * Global HTTP error boundary interceptor.
 *
 * Handles:
 * - 401 Unauthorized (after authRefreshInterceptor has already tried token refresh):
 *   clears the user session and redirects to the BFF login endpoint.
 * - /bff/auth/me errors (any non-401 status, including 403, 500, 503, 0 network error):
 *   the user is authenticated in Keycloak but the backend cannot provision them.
 *   We normalize all these cases to a 403 user_not_provisioned error so the
 *   authGuard and SessionService can handle them consistently. This prevents
 *   the silent "no count" failure that occurred when the backend returned 500
 *   or a network error instead of the expected 403 reason.
 * - 500 Internal Server Error, 503 Service Unavailable, 0 (network error):
 *   logs to console and rethrows so individual components can show their own error state.
 * - All other errors: passes through unchanged.
 *
 * IMPORTANT: This interceptor must be registered AFTER authRefreshInterceptor and authInterceptor()
 * in withInterceptors([authRefreshInterceptor, authInterceptor(), globalErrorInterceptor]).
 */
export const globalErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const sessionService = inject(SessionService);
  const environment = inject(ENVIRONMENT_TOKEN);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }

      if (error.status === 401) {
        if (!redirectingToLogin) {
          redirectingToLogin = true;
          console.warn('[GlobalErrorInterceptor] Unrecoverable 401 — clearing session and redirecting to BFF login', req.url);
          sessionService.clearCache();
          const app = resolveAuthApp(environment);
          const ret = encodeURIComponent(resolveAuthReturnUrl());
          location.replace(`${environment.api.baseUrl}/bff/auth/login/${app}?redirect=${ret}`);
          setTimeout(() => { redirectingToLogin = false; }, 5000);
        }
        return EMPTY;
      }

      // /bff/auth/me falló por un motivo distinto a 401.
      // El usuario está autenticado en Keycloak pero el backend no puede
      // provisionarlo (puede ser 403, 500, 503 o un error de red status 0).
      // Normalizamos a 403 user_not_provisioned para que authGuard y
      // SessionService.ensureSession$() lo manejen de forma consistente.
      if (req.url.includes('/bff/auth/me')) {
        console.warn(
          '[GlobalErrorInterceptor] /bff/auth/me falló con status',
          error.status,
          '— marcando usuario como no provisionado',
          req.url
        );
        sessionService.markUserNotProvisioned();
        const specificError = new HttpErrorResponse({
          status: 403,
          statusText: 'User Not Provisioned',
          url: req.url,
          error: { reason: 'user_not_provisioned' },
        });
        return throwError(() => specificError);
      }

      if (error.status === 500 || error.status === 503 || error.status === 0) {
        console.error('[GlobalErrorInterceptor] HTTP error', error.status, req.url, error.message ?? error);
      }

      return throwError(() => error);
    })
  );
};
