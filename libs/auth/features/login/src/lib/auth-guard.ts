// auth.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import {
  SessionService,
  ENVIRONMENT_TOKEN,
  redirectToBffLogin,
} from '@guiders-frontend/auth/data-access/session';

export const authGuard: CanActivateFn = () => {
  const sessionService = inject(SessionService);
  const environment = inject(ENVIRONMENT_TOKEN);

  console.log('AuthGuard: Checking user session...');

  return sessionService.ensureSession$().pipe(
    map((user) => {
      if (!user) return false;

      const consoleRoles = ['admin', 'commercial', 'supervisor'];
      const hasConsoleRole = user.roles?.some((r) => consoleRoles.includes(r));

      // Solo superadmin (staff Guiders) → Admin :4201, no Console de cliente
      if (!hasConsoleRole) {
        if (user.roles?.includes('superadmin') && environment.adminUrl) {
          console.warn(
            '[AuthGuard] Usuario superadmin sin rol de Console — redirigiendo a Admin',
          );
          location.replace(environment.adminUrl);
          return false;
        }
        redirectToBffLogin(environment);
        return false;
      }

      return true;
    }),
    catchError((error: unknown) => {
      // 403 user_not_provisioned: el usuario está autenticado en Keycloak pero
      // no existe en la BD del backend. Redirigir al login causaría un loop
      // infinito; en su lugar navegamos a /account-not-configured para mostrar
      // la página de error específica. El guard devuelve false para bloquear
      // la ruta protegida.
      if (
        error instanceof HttpErrorResponse &&
        error.status === 403 &&
        (error.error as { reason?: string })?.reason === 'user_not_provisioned'
      ) {
        if (window.location.pathname !== '/account-not-configured') {
          location.replace('/account-not-configured');
        }
        return of(false);
      }

      // Sin sesión de Console (p. ej. solo hay cookie de Admin): ir al login
      redirectToBffLogin(environment);
      return of(false);
    }),
  );
};
