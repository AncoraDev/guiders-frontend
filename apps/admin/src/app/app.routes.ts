import { Route } from '@angular/router';
import { adminGuard } from '@guiders-frontend/redirect-confirm';

export const appRoutes: Route[] = [
  { path: '', redirectTo: 'clients', pathMatch: 'full' },
  {
    path: 'clients',
    loadChildren: () =>
      import('@guiders-frontend/clients').then((m) => m.clientsRoutes),
    canActivate: [adminGuard],
  },
  {
    path: 'proveedores',
    loadChildren: () =>
      import('@guiders-frontend/clients').then((m) => m.providersRoutes),
    canActivate: [adminGuard],
  },
  {
    path: 'api',
    loadChildren: () =>
      import('@guiders-frontend/clients').then((m) => m.apiDocsRoutes),
    canActivate: [adminGuard],
  },
  {
    path: 'versiones',
    loadChildren: () =>
      import('@guiders-frontend/clients').then((m) => m.sdkVersionsRoutes),
    canActivate: [adminGuard],
  },
  {
    path: 'users',
    loadChildren: () =>
      import('@guiders-frontend/clients').then((m) => m.platformUsersRoutes),
    canActivate: [adminGuard],
  },
  {
    path: 'settings',
    loadChildren: () =>
      import('@guiders-frontend/auth/features/settings').then(
        (m) => m.settingsRoutes,
      ),
    canActivate: [adminGuard],
  },
  {
    path: 'login',
    loadChildren: () =>
      import('@guiders-frontend/auth/features/login').then(
        (m) => m.loginRoutes,
      ),
  },
  {
    path: '**',
    redirectTo: 'clients',
  },
];
