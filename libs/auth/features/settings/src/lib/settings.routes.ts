import { Route } from '@angular/router';
import { SettingsLayoutComponent } from './components/settings-layout';

export const settingsRoutes: Route[] = [
  {
    path: '',
    component: SettingsLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'profile' },
      {
        path: 'profile',
        loadComponent: () => import('./sections/profile-settings').then(m => m.ProfileSettingsComponent),
        title: 'Perfil · Configuración',
      },
      {
        path: 'notifications',
        loadComponent: () => import('./sections/notifications-settings').then(m => m.NotificationsSettingsComponent),
        title: 'Notificaciones · Configuración',
      },
      {
        path: 'appearance',
        loadComponent: () => import('./sections/appearance-settings').then(m => m.AppearanceSettingsComponent),
        title: 'Apariencia · Configuración',
      },
      {
        path: 'replies',
        loadComponent: () =>
          import('./sections/replies-settings').then((m) => m.RepliesSettingsComponent),
        title: 'Frases rápidas · Configuración',
      },
      { path: 'chat', redirectTo: 'replies', pathMatch: 'full' },
      {
        path: 'widget',
        loadComponent: () =>
          import('./sections/widget-settings').then(
            (m) => m.WidgetSettingsComponent,
          ),
        title: 'Chat web · Configuración',
      },
      {
        path: 'contact-form',
        loadComponent: () =>
          import('./sections/contact-form-settings').then(
            (m) => m.ContactFormSettingsComponent,
          ),
        title: 'Formulario de contacto · Configuración',
      },
      {
        path: 'lead-capture-notify',
        loadComponent: () =>
          import('./sections/lead-capture-notify-settings').then(
            (m) => m.LeadCaptureNotifySettingsComponent,
          ),
        title: 'Avisos de captación · Configuración',
      },
      {
        path: 'privacy',
        loadComponent: () => import('./sections/privacy-settings').then(m => m.PrivacySettingsComponent),
        title: 'Privacidad · Configuración',
      },
    ],
  },
];
