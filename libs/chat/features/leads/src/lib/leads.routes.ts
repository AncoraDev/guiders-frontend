import { Route } from '@angular/router';
import { authGuard } from '@guiders-frontend/auth/features/login';
import { Leads } from './leads/leads';

export const leadsRoutes: Route[] = [
  {
    path: '',
    component: Leads,
    canActivate: [authGuard],
    title: 'Leads',
  },
];
