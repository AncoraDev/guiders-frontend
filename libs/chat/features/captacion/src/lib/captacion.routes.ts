import { inject } from '@angular/core';
import { CanActivateFn, Route, Router } from '@angular/router';
import { authGuard } from '@guiders-frontend/auth/features/login';
import { UserService } from '@guiders-frontend/auth/data-access/session';
import { Captacion } from './captacion/captacion';

/**
 * El guion de captación es configuración de la empresa. Los leads captados
 * viven en el módulo independiente /leads.
 */
const adminOnlyGuard: CanActivateFn = () => {
  const userService = inject(UserService);
  const router = inject(Router);
  if (userService.hasRole('admin')) {
    return true;
  }
  return router.createUrlTree(['/leads']);
};

export const captacionRoutes: Route[] = [
  {
    path: 'leads',
    redirectTo: '/leads',
    pathMatch: 'full',
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'guion',
  },
  {
    path: 'guion',
    component: Captacion,
    canActivate: [authGuard, adminOnlyGuard],
    title: 'Captación',
  },
];
