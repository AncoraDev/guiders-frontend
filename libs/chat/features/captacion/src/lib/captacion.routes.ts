import { inject } from '@angular/core';
import { CanActivateFn, Route, Router } from '@angular/router';
import { authGuard } from '@guiders-frontend/auth/features/login';
import { UserService } from '@guiders-frontend/auth/data-access/session';
import { Captacion } from './captacion/captacion';
import { CaptacionLeads } from './captacion-leads/captacion-leads';
import { CaptacionShell } from './captacion-shell/captacion-shell';

/**
 * Solo admin: el guion de captación es configuración de la empresa. Los leads
 * que deja el guion sí los trabaja el comercial, así que el listado queda
 * fuera de esta restricción.
 */
const adminOnlyGuard: CanActivateFn = () => {
  const userService = inject(UserService);
  const router = inject(Router);
  if (userService.hasRole('admin')) {
    return true;
  }
  return router.createUrlTree(['/captacion', 'leads']);
};

export const captacionRoutes: Route[] = [
  {
    path: '',
    component: CaptacionShell,
    canActivate: [authGuard],
    children: [
      {
        path: 'guion',
        component: Captacion,
        canActivate: [adminOnlyGuard],
        title: 'Captación · Guion',
      },
      {
        path: 'leads',
        component: CaptacionLeads,
        title: 'Captación · Leads captados',
      },
      {
        // El admin entra a configurar; el comercial solo puede trabajar leads.
        path: '',
        pathMatch: 'full',
        redirectTo: () =>
          inject(UserService).hasRole('admin') ? 'guion' : 'leads',
      },
    ],
  },
];
