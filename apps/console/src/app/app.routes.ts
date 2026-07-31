import { Route } from '@angular/router';
import { authGuard } from '@guiders-frontend/auth/features/login';
import { NotProvisionedComponent } from './not-provisioned/not-provisioned';

export const appRoutes: Route[] = [
	{
		path: 'atencion',
		loadChildren: () =>
			import('@guiders-frontend/chat/features/atencion').then((m) => m.atencionRoutes),
		title: 'Atención',
		canActivate: [authGuard],
	},
	{
		path: 'visitors',
		loadChildren: () =>
			import('@guiders-frontend/visitors').then((m) => m.visitorsRoutes),
		title: 'Visitantes',
		canActivate: [authGuard],
	},
	{
		path: 'conexiones',
		loadChildren: () =>
			import('@guiders-frontend/conexiones').then((m) => m.conexionesRoutes),
		title: 'Conexiones',
		canActivate: [authGuard],
	},
	{
		path: 'usuarios',
		loadChildren: () =>
			import('@guiders-frontend/usuarios').then((m) => m.usuariosRoutes),
		title: 'Usuarios',
		canActivate: [authGuard],
	},
	{
		path: 'contacts',
		loadChildren: () => import('@guiders-frontend/contacts').then(m => m.contactsRoutes),
		title: 'Contactos',
		canActivate: [authGuard],
	},
	{
		path: 'settings',
		loadChildren: () => import('@guiders-frontend/auth/features/settings').then(m => m.settingsRoutes),
		title: 'Configuración',
		canActivate: [authGuard],
	},
	{
		// Ruta de emergencia: usuario autenticado en Keycloak pero no provisionado en BD.
		// No requiere authGuard — no redirigir al login (causaría loop infinito).
		path: 'account-not-configured',
		component: NotProvisionedComponent,
		title: 'Cuenta no configurada',
	},
	{
		path: '',
		pathMatch: 'full',
		redirectTo: 'atencion',
	},
	{
		path: '**',
		redirectTo: 'atencion',
	}
];
