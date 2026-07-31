import { Route } from '@angular/router';
import { authGuard } from '@guiders-frontend/auth/features/login';
import { Conexiones } from './conexiones/conexiones';

export const conexionesRoutes: Route[] = [
  {
    path: '',
    component: Conexiones,
    canActivate: [authGuard],
    title: 'Conexiones',
  },
];
