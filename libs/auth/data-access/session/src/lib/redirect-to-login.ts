import { Environment } from '@guiders-frontend/shared/types';
import { resolveAuthApp, resolveAuthReturnUrl } from './resolve-auth-app';

/**
 * Redirige al login BFF de la app actual (console | admin).
 * Usar cuando no hay sesión HttpOnly de esa app.
 */
export function redirectToBffLogin(
  environment: Pick<Environment, 'api' | 'auth'>,
): void {
  const app = resolveAuthApp(environment);
  const ret = encodeURIComponent(resolveAuthReturnUrl());
  const base = environment.api.baseUrl.replace(/\/$/, '');
  window.location.replace(`${base}/bff/auth/login/${app}?redirect=${ret}`);
}
