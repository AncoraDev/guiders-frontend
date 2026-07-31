import { inject } from '@angular/core';
import { CanActivateFn, Route, Router } from '@angular/router';
import { authGuard } from '@guiders-frontend/auth/features/login';
import { UserService } from '@guiders-frontend/auth/data-access/session';
import { Usuarios } from './usuarios/usuarios';

/** Solo admin: el endpoint company-users exige rol admin. */
const adminOnlyGuard: CanActivateFn = () => {
  const userService = inject(UserService);
  const router = inject(Router);
  if (userService.hasRole('admin')) {
    return true;
  }
  return router.createUrlTree(['/atencion']);
};

export const usuariosRoutes: Route[] = [
  {
    path: '',
    component: Usuarios,
    canActivate: [authGuard, adminOnlyGuard],
    title: 'Usuarios',
  },
];
