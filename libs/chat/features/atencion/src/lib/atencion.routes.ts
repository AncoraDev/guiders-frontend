import { Route } from '@angular/router';
import { authGuard } from '@guiders-frontend/auth/features/login';
import { Atencion } from './atencion/atencion';

export const atencionRoutes: Route[] = [
  {
    path: '',
    component: Atencion,
    canActivate: [authGuard],
  },
];
