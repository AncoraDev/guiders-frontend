import { inject } from '@angular/core';
import { CanActivateFn, Route, Router } from '@angular/router';
import { authGuard } from '@guiders-frontend/auth/features/login';
import { UserService } from '@guiders-frontend/auth/data-access/session';
import { Captacion } from './captacion/captacion';

/** Solo admin: el guion de captación es configuración de la empresa. */
const adminOnlyGuard: CanActivateFn = () => {
  const userService = inject(UserService);
  const router = inject(Router);
  if (userService.hasRole('admin')) {
    return true;
  }
  return router.createUrlTree(['/atencion']);
};

export const captacionRoutes: Route[] = [
  {
    path: '',
    component: Captacion,
    canActivate: [authGuard, adminOnlyGuard],
    title: 'Captación',
  },
];
