import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { EMPTY, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { SessionService } from './session.service';
import { ENVIRONMENT_TOKEN } from './environment.token';
import { redirectToBffLogin } from './redirect-to-login';

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
          console.warn(
            '[GlobalErrorInterceptor] Unrecoverable 401 — clearing session and redirecting to BFF login',
            req.url,
          );
          sessionService.clearCache();
          redirectToBffLogin(environment);
          setTimeout(() => {
            redirectingToLogin = false;
          }, 5000);
        }
        return EMPTY;
      }

      // /bff/auth/me: 403 real de no provisionado. Otros errores no se
      // normalizan a "not provisioned" (evita confundir fallos de red / 5xx
      // con falta de alta en BD).
      if (
        req.url.includes('/bff/auth/me') &&
        error.status === 403 &&
        (error.error as { reason?: string } | null)?.reason ===
          'user_not_provisioned'
      ) {
        sessionService.markUserNotProvisioned();
        return throwError(() => error);
      }

      if (error.status === 500 || error.status === 503 || error.status === 0) {
        console.error('[GlobalErrorInterceptor] HTTP error', error.status, req.url, error.message ?? error);
      }

      return throwError(() => error);
    })
  );
};
