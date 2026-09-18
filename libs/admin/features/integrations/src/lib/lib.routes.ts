import { inject } from '@angular/core';
import { CanActivateFn, Route, Router } from '@angular/router';
import { UserService } from '@guiders-frontend/auth/data-access/session';
import { Integrations } from './integrations/integrations';
import { LeadCarsConfigComponent } from './leadcars-config/leadcars-config';

/** Solo admin: la API de CRM exige rol admin. */
const adminOnlyGuard: CanActivateFn = () => {
  const userService = inject(UserService);
  const router = inject(Router);
  if (userService.hasRole('admin')) {
    return true;
  }
  return router.createUrlTree(['/atencion']);
};

export const integrationsRoutes: Route[] = [
  {
    path: '',
    component: Integrations,
    canActivate: [adminOnlyGuard],
    children: [
      { path: '', redirectTo: 'leadcars', pathMatch: 'full' },
      { path: 'leadcars', component: LeadCarsConfigComponent },
    ],
  },
];
