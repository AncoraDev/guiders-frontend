import { Environment } from '@guiders-frontend/shared/types';

export type AuthApp = 'console' | 'admin';

/**
 * Resuelve si la app en ejecución es console o admin.
 * En local Admin corre en :4201 sin "admin" en el hostname.
 */
export function resolveAuthApp(environment?: Pick<Environment, 'auth'> | null): AuthApp {
  if (environment?.auth?.clientId === 'admin') {
    return 'admin';
  }

  if (typeof window === 'undefined') {
    return 'console';
  }

  const { hostname, pathname, port } = window.location;
  if (
    hostname.includes('admin') ||
    pathname.includes('/admin') ||
    port === '4201'
  ) {
    return 'admin';
  }

  return 'console';
}

/** URL absoluta segura para el parámetro redirect del BFF. */
export function resolveAuthReturnUrl(): string {
  if (typeof window === 'undefined') {
    return '/';
  }
  return window.location.href;
}
