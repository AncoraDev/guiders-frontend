import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { catchError, map, of, from, switchMap } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { SessionService, ENVIRONMENT_TOKEN } from '@guiders-frontend/auth/data-access/session';
import { RedirectConfirmService } from './redirect-confirm.service';

export const adminGuard: CanActivateFn = () => {
  const sessionService = inject(SessionService);
  const environment = inject(ENVIRONMENT_TOKEN);
  const redirectConfirmService = inject(RedirectConfirmService);

  return sessionService.ensureSession$().pipe(
    switchMap(user => {
      if (!user) {
        return of(false);
      }

      // Check if user has admin role
      if (user.roles?.includes('admin')) {
        return of(true);
      }

      // If user has commercial role but not admin, show confirmation popup
      if (user.roles?.includes('commercial') && environment.consoleUrl) {
        return from(redirectConfirmService.show({
          title: 'Acceso restringido',
          message: 'No tienes permisos de administrador. Seras redirigido a la consola de comerciales.',
          confirmText: 'Ir a consola',
          cancelText: 'Cerrar sesion',
          redirectUrl: environment.consoleUrl
        })).pipe(
          map(() => false)
        );
      }

      // User has neither admin nor commercial role - deny access
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
      const ret = encodeURIComponent(window.location.href);
      location.replace(`${environment.api.baseUrl}/bff/auth/login/admin?redirect=${ret}`);
      return of(false);
    })
  );
};
