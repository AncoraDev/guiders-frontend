import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ENVIRONMENT_TOKEN } from './environment.token';
import { resolveAuthApp } from './resolve-auth-app';

/**
 * Marca cada request HTTP con la app origen (console | admin)
 * para que el BFF/AuthGuard no mezcle cookies de sesión.
 */
export const guidersAppInterceptor: HttpInterceptorFn = (req, next) => {
  const environment = inject(ENVIRONMENT_TOKEN, { optional: true });
  const app = resolveAuthApp(environment);
  return next(
    req.clone({
      setHeaders: {
        'X-Guiders-App': app,
      },
    }),
  );
};
