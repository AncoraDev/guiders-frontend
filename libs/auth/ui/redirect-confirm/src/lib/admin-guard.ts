import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { catchError, from, map, of, switchMap, tap } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import {
  SessionService,
  UserService,
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
  const userService = inject(UserService);
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

      // Ya hay un diálogo abierto: no reabrir (el ** → clients lo re-disparaba).
      if (redirectConfirmService.isOpen()) {
        return of(false);
      }

      // Admin / commercial / supervisor del cliente → Console
      if (environment.consoleUrl) {
        return from(
          redirectConfirmService.show({
            title: 'Acceso restringido',
            message:
              'Esta herramienta es solo para el equipo Guiders. Serás redirigido a la consola de tu empresa.',
            confirmText: 'Ir a consola',
            cancelText: 'Cerrar sesión',
            redirectUrl: environment.consoleUrl,
          }),
        ).pipe(
          tap((confirmed) => {
            if (!confirmed) {
              userService.logout('admin');
            }
          }),
          map(() => false),
        );
      }

      userService.logout('admin');
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
