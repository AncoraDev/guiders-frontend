import { Injectable, inject, OnDestroy } from '@angular/core';
import { AuthRefreshService } from './auth-refresh.service';
import { firstValueFrom } from 'rxjs';
import { ENVIRONMENT_TOKEN } from './environment.token';
import { resolveAuthApp, resolveAuthReturnUrl } from './resolve-auth-app';

/**
 * Configuración del Session Guardian
 */
export interface SessionGuardianConfig {
  /** Tiempo en minutos para considerar sesión inactiva y hacer refresh proactivo (default: 5) */
  inactivityRefreshMinutes?: number;

  /** Tiempo en minutos para considerar sesión expirada y forzar re-login (default: 30) */
  inactivityExpiredMinutes?: number;

  /** Intervalo en minutos para heartbeat periódico (0 = deshabilitado, default: 0) */
  heartbeatIntervalMinutes?: number;

  /** Habilitar logs de debug (default: false) */
  debug?: boolean;
}

/**
 * SessionGuardianService
 *
 * Servicio que protege la sesión del usuario contra expiraciones silenciosas
 * cuando la página está en background o suspendida por el navegador.
 *
 * Problemas que resuelve:
 * - setTimeout se pausa en páginas en background
 * - Cookies expiran mientras el usuario no está activo
 * - WebSocket se reconecta con cookies expiradas
 * - Sin detección de cuándo el usuario vuelve después de inactividad
 *
 * Solución:
 * - Page Visibility API para detectar cuando la página vuelve visible
 * - Validación proactiva de sesión al retomar actividad
 * - Refresh automático si la sesión está próxima a expirar
 * - Re-login si la sesión ya expiró
 * - Heartbeat opcional para mantener sesión viva
 *
 * @example
 * ```typescript
 * // En app.config.ts
 * {
 *   provide: APP_INITIALIZER,
 *   useFactory: (guardian: SessionGuardianService) => () => {
 *     guardian.initialize({ inactivityRefreshMinutes: 5 });
 *   },
 *   deps: [SessionGuardianService],
 *   multi: true
 * }
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class SessionGuardianService implements OnDestroy {
  private readonly authRefreshService = inject(AuthRefreshService);
  private readonly environment = inject(ENVIRONMENT_TOKEN);

  private config: Required<SessionGuardianConfig> = {
    inactivityRefreshMinutes: 5,
    inactivityExpiredMinutes: 30,
    heartbeatIntervalMinutes: 0,
    debug: false
  };

  private lastActivityTimestamp: number = Date.now();
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private isInitialized = false;
  private isValidating = false;

  /**
   * Inicializa el guardian con la configuración especificada
   */
  initialize(config: SessionGuardianConfig = {}): void {
    if (this.isInitialized) {
      this.log('[SessionGuardian] Ya inicializado, ignorando...');
      return;
    }

    this.config = { ...this.config, ...config };
    this.log('[SessionGuardian] 🛡️ Inicializando protección de sesión...', this.config);

    this.setupPageVisibilityListener();
    this.setupFocusListener();

    if (this.config.heartbeatIntervalMinutes > 0) {
      this.setupHeartbeat();
    }

    this.isInitialized = true;
    this.lastActivityTimestamp = Date.now();

    this.log('[SessionGuardian] ✅ Guardian inicializado correctamente');
  }

  /**
   * Valida y refresca la sesión si es necesario.
   * Útil para llamar antes de operaciones críticas (ej: reconexión WebSocket)
   *
   * @returns Promise que se resuelve cuando la sesión es válida
   */
  async ensureValidSession(): Promise<void> {
    if (this.isValidating) {
      this.log('[SessionGuardian] Validación ya en progreso, esperando...');
      // Si ya hay validación en progreso, esperar un poco y asumir que estará ok
      await this.sleep(100);
      return;
    }

    const inactiveMinutes = this.getInactiveMinutes();
    this.log(`[SessionGuardian] 🔍 Validando sesión (inactivo ${inactiveMinutes.toFixed(1)} min)...`);

    // Si está dentro del rango normal, no hacer nada
    if (inactiveMinutes < this.config.inactivityRefreshMinutes) {
      this.log('[SessionGuardian] ✅ Sesión válida, no requiere refresh');
      return;
    }

    // Si excedió el tiempo de expiración, forzar re-login
    if (inactiveMinutes >= this.config.inactivityExpiredMinutes) {
      this.log(`[SessionGuardian] ❌ Sesión expirada (${inactiveMinutes.toFixed(1)} min inactivo)`);
      this.forceRelogin('Sesión expirada por inactividad prolongada');
      throw new Error('Sesión expirada');
    }

    // Si está en el rango intermedio, hacer refresh
    this.log(`[SessionGuardian] 🔄 Sesión próxima a expirar, haciendo refresh...`);
    await this.refreshSession();
  }

  /**
   * Obtiene los minutos de inactividad
   */
  private getInactiveMinutes(): number {
    const now = Date.now();
    const elapsedMs = now - this.lastActivityTimestamp;
    return elapsedMs / (1000 * 60);
  }

  /**
   * Actualiza el timestamp de última actividad
   */
  private updateActivity(): void {
    this.lastActivityTimestamp = Date.now();
  }

  /**
   * Configura listener para Page Visibility API
   */
  private setupPageVisibilityListener(): void {
    if (typeof document === 'undefined') return;

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.onPageVisible();
      } else {
        this.log('[SessionGuardian] 👁️ Página oculta');
      }
    });

    this.log('[SessionGuardian] 📡 Listener de visibilitychange configurado');
  }

  /**
   * Configura listener para evento focus de la ventana
   */
  private setupFocusListener(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('focus', () => {
      this.onPageFocus();
    });

    this.log('[SessionGuardian] 📡 Listener de focus configurado');
  }

  /**
   * Maneja cuando la página vuelve a estar visible
   */
  private async onPageVisible(): Promise<void> {
    const inactiveMinutes = this.getInactiveMinutes();

    this.log(`[SessionGuardian] 👁️ Página visible de nuevo (inactivo ${inactiveMinutes.toFixed(1)} min)`);

    try {
      await this.ensureValidSession();
      this.updateActivity();
    } catch (error) {
      this.log('[SessionGuardian] ❌ Error validando sesión:', error);
    }
  }

  /**
   * Maneja cuando la ventana recupera el foco
   */
  private async onPageFocus(): Promise<void> {
    const inactiveMinutes = this.getInactiveMinutes();

    // Solo actuar si ha estado inactivo un tiempo significativo (>1 min)
    if (inactiveMinutes < 1) {
      return;
    }

    this.log(`[SessionGuardian] 🎯 Ventana con foco de nuevo (inactivo ${inactiveMinutes.toFixed(1)} min)`);

    try {
      await this.ensureValidSession();
      this.updateActivity();
    } catch (error) {
      this.log('[SessionGuardian] ❌ Error validando sesión:', error);
    }
  }

  /**
   * Configura heartbeat periódico para mantener la sesión activa
   */
  private setupHeartbeat(): void {
    const intervalMs = this.config.heartbeatIntervalMinutes * 60 * 1000;

    this.log(`[SessionGuardian] 💓 Configurando heartbeat cada ${this.config.heartbeatIntervalMinutes} minutos`);

    this.heartbeatTimer = setInterval(async () => {
      // Solo hacer heartbeat si la página está visible
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        this.log('[SessionGuardian] 💓 Heartbeat - validando sesión...');
        try {
          await this.refreshSession();
          this.updateActivity();
        } catch (error) {
          this.log('[SessionGuardian] ❌ Error en heartbeat:', error);
        }
      } else {
        this.log('[SessionGuardian] 💓 Heartbeat omitido (página no visible)');
      }
    }, intervalMs);
  }

  /**
   * Refresca la sesión usando el AuthRefreshService
   */
  private async refreshSession(): Promise<void> {
    if (this.isValidating) {
      this.log('[SessionGuardian] Refresh ya en progreso');
      return;
    }

    this.isValidating = true;

    try {
      await firstValueFrom(this.authRefreshService.refreshSession());
      this.log('[SessionGuardian] ✅ Sesión refrescada correctamente');
    } catch (error: any) {
      this.log('[SessionGuardian] ❌ Error al refrescar sesión:', error.message);

      // Si el refresh falla con 401/403, la sesión no es renovable
      if (error.status === 401 || error.status === 403) {
        this.forceRelogin('No se pudo renovar la sesión');
      }

      throw error;
    } finally {
      this.isValidating = false;
    }
  }

  /**
   * Fuerza re-login del usuario redirigiendo a la página de login
   */
  private forceRelogin(reason: string): void {
    this.log(`[SessionGuardian] 🚪 Forzando re-login: ${reason}`);

    if (typeof window === 'undefined') return;

    // Limpiar tokens del localStorage
    this.clearLocalStorage();

    // Redirigir al login
    this.redirectToLogin();
  }

  /**
   * Determina la app actual basándose en la URL o configuración
   */
  private getCurrentApp(): string {
    return resolveAuthApp(this.environment);
  }

  /**
   * Redirige al login cuando la sesión expira
   */
  private redirectToLogin(): void {
    if (typeof window === 'undefined') return;

    const currentApp = this.getCurrentApp();
    const returnUrl = encodeURIComponent(resolveAuthReturnUrl());
    const bffBase = this.environment.api.baseUrl.startsWith('/')
      ? window.location.origin + this.environment.api.baseUrl
      : this.environment.api.baseUrl;
    const loginUrl = `${bffBase}/bff/auth/login/${currentApp}?redirect=${returnUrl}`;

    console.error(`[SessionGuardian] Sesión expirada, redirigiendo al login: ${loginUrl}`);
    window.location.replace(loginUrl);
  }

  /**
   * Limpia el localStorage de tokens y datos de sesión
   */
  private clearLocalStorage(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      // Limpiar tokens
      localStorage.removeItem('access-token');
      localStorage.removeItem('refresh-token');
      localStorage.removeItem('token-expiry');

      this.log('[SessionGuardian] 🧹 LocalStorage limpiado');
    } catch (error) {
      console.error('[SessionGuardian] Error al limpiar localStorage:', error);
    }
  }

  /**
   * Limpia recursos al destruir el servicio
   */
  ngOnDestroy(): void {
    this.log('[SessionGuardian] 🧹 Limpiando recursos...');

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * Helper para logging con control de debug
   */
  private log(message: string, ...args: any[]): void {
    if (this.config.debug) {
      console.log(message, ...args);
    } else if (message.includes('❌') || message.includes('🚪')) {
      // Siempre mostrar errores y eventos críticos
      console.warn(message, ...args);
    } else if (message.includes('✅') || message.includes('🛡️')) {
      // Siempre mostrar eventos importantes
      console.log(message, ...args);
    }
  }

  /**
   * Helper para sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
