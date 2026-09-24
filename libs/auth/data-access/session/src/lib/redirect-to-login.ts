import { Environment } from '@guiders-frontend/shared/types';
import { resolveAuthApp, resolveAuthReturnUrl } from './resolve-auth-app';

/**
 * Console dentro del iframe de LeadCars, o abierta con ?embed=true.
 * En ese caso el login de Keycloak no puede mostrarse (X-Frame-Options).
 */
export function isEmbedContext(): boolean {
  try {
    if (window.self !== window.top) return true;
    return new URLSearchParams(window.location.search).get('embed') === 'true';
  } catch {
    return true;
  }
}

/**
 * Redirige al login BFF de la app actual (console | admin).
 * Usar cuando no hay sesión HttpOnly de esa app.
 */
export function redirectToBffLogin(
  environment: Pick<Environment, 'api' | 'auth'>,
): void {
  if (isEmbedContext()) return;
  const app = resolveAuthApp(environment);
  const ret = encodeURIComponent(resolveAuthReturnUrl());
  const base = environment.api.baseUrl.replace(/\/$/, '');
  window.location.replace(`${base}/bff/auth/login/${app}?redirect=${ret}`);
}
