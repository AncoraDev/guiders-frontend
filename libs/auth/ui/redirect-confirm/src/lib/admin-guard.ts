import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { catchError, map, of, from, switchMap } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import {
  SessionService,
  ENVIRONMENT_TOKEN,
  redirectToBffLogin,
} from '@guiders-frontend/auth/data-access/session';
import { RedirectConfirmService } from './redirect-confirm.service';

/**
 * Guard de la app Admin (plataforma Guiders).
 * Solo permite rol `superadmin`. Los admin de cliente van a Console.
 */
export const adminGuard: CanActivateFn = () => {
  const sessionService = inject(SessionService);
  const environment = inject(ENVIRONMENT_TOKEN);
  const redirectConfirmService = inject(RedirectConfirmService);

  return sessionService.ensureSession$().pipe(
    switchMap((user) => {
      if (!user) {
        return of(false);
      }

      if (user.roles?.includes('superadmin')) {
        return of(true);
      }

      // Admin / commercial / supervisor del cliente → Console
      if (
        environment.consoleUrl &&
        user.roles?.some((r) =>
          ['admin', 'commercial', 'supervisor'].includes(r),
        )
      ) {
        return from(
          redirectConfirmService.show({
            title: 'Acceso restringido',
            message:
              'Esta herramienta es solo para el equipo Guiders. Serás redirigido a la consola de tu empresa.',
            confirmText: 'Ir a consola',
            cancelText: 'Cerrar sesión',
            redirectUrl: environment.consoleUrl,
          }),
        ).pipe(map(() => false));
      }

      return of(false);
    }),
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 403 &&
        (error.error as { reason?: string })?.reason === 'user_not_provisioned'
      ) {
        return of(false);
      }
      // Sin sesión de Admin (p. ej. solo hay cookie de Console): ir al login
      redirectToBffLogin(environment);
      return of(false);
    }),
  );
};
