import { Injectable, inject, DestroyRef, InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  EmbedMessage,
  EMBED_PROTOCOL_VERSION,
  isEmbedMessage,
} from '@guiders-frontend/types';
import { ENVIRONMENT_TOKEN } from '@guiders-frontend/auth/data-access/session';
import { EmbedAllowedOriginsService } from './embed-allowed-origins.service';

/** Ruta tras el handshake. Admin: dashboard. Console: Atención. */
export const EMBED_AFTER_AUTH_PATH = new InjectionToken<string>(
  'EMBED_AFTER_AUTH_PATH',
  { factory: () => '/embed/dashboard' },
);

/**
 * Servicio que orquesta el handshake postMessage con el parent window
 * (Story 3.1 — Epic 3: Cross-Frame Auth Handshake).
 *
 * Flujo:
 * 1. bootstrap() se llama una vez al startup de Angular
 * 2. Envía `guiders:v1:ready` al parent (con la versión del protocolo)
 * 3. Registra un listener de `message` events
 * 4. Para cada mensaje entrante:
 *    - Valida que sea un EmbedMessage válido (type guard)
 *    - Valida origin contra la allowlist
 *    - Si pasa: procesa el mensaje según su tipo
 *    - Si falla: silent rejection + WARN log (NUNCA token en log)
 *
 * Spec: `_bmad-output/planning-artifacts/epics.md` Story 3.1
 */
@Injectable({ providedIn: 'root' })
export class EmbedBootstrapService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly originsService = inject(EmbedAllowedOriginsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly afterAuthPath = inject(EMBED_AFTER_AUTH_PATH);
  private readonly environment = inject(ENVIRONMENT_TOKEN, { optional: true });

  private bootstrapped = false;
  private sessionReady: Promise<void> | null = null;
  private resolveSession: (() => void) | null = null;
  private rejectSession: ((error: unknown) => void) | null = null;

  /**
   * Inicializa el handshake. Idempotente — llamar múltiples veces
   * solo registra UN listener de `message`.
   */
  bootstrap(): void {
    if (this.bootstrapped) return;
    this.bootstrapped = true;
    this.ensureSessionPromise();
    const companyId = new URLSearchParams(window.location.search).get(
      'companyId',
    );
    if (!companyId) {
      this.registerMessageListener();
      this.sendReadyMessage();
      return;
    }
    void this.loadOriginsThenListen(companyId);
  }

  private async loadOriginsThenListen(companyId: string): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ origins: string[] }>(
          this.apiUrl(
            `/embed/allowed-origins?companyId=${encodeURIComponent(companyId)}`,
          ),
        ),
      );
      this.originsService.setAllowed(response.origins ?? []);
    } catch (error: unknown) {
      console.warn(
        '[EmbedBootstrap] No se pudieron cargar los orígenes permitidos',
        error,
      );
    }
    this.registerMessageListener();
    this.sendReadyMessage();
  }

  /**
   * Se resuelve cuando el parent entrega el token y la cookie de sesión
   * queda establecida. Arranca el handshake si aún no se ha hecho.
   */
  whenAuthenticated(): Promise<void> {
    this.bootstrap();
    return this.ensureSessionPromise();
  }

  private sendReadyMessage(): void {
    const message: EmbedMessage = {
      type: 'guiders:v1:ready',
      payload: { version: EMBED_PROTOCOL_VERSION },
    };
    window.parent.postMessage(message, '*');
  }

  private registerMessageListener(): void {
    const listener = (event: MessageEvent): void => {
      this.handleMessage(event);
    };
    window.addEventListener('message', listener);

    // Cleanup: unregister on Angular destroy (previene memory leak)
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('message', listener);
    });
  }

  private handleMessage(event: MessageEvent): void {
    // AC3 + AC4: silent rejection of invalid messages
    if (!isEmbedMessage(event)) {
      return;
    }

    const message = event.data;

    if (message.type === 'guiders:v1:ready') {
      // Ignore echoes of our own ready message from other iframes
      return;
    }

    // AC3: origin validation — silent rejection if invalid
    if (!this.originsService.isAllowed(event.origin)) {
      console.warn(
        `[EmbedBootstrap] Message from unauthorized origin rejected: ${event.origin}`,
      );
      return;
    }

    if (message.type === 'leadcars:v1:auth') {
      this.authenticate(message.payload.token, message.payload.userId);
      return;
    }

    if (message.type === 'leadcars:v1:logout') {
      this.logout();
      return;
    }
  }

  private apiUrl(path: string): string {
    const base = this.environment?.api?.baseUrl ?? '/api';
    return `${base.replace(/\/$/, '')}${path}`;
  }

  private ensureSessionPromise(): Promise<void> {
    if (!this.sessionReady) {
      this.sessionReady = new Promise<void>((resolve, reject) => {
        this.resolveSession = resolve;
        this.rejectSession = reject;
      });
    }
    return this.sessionReady;
  }

  private authenticate(token: string, userId?: string): void {
    this.ensureSessionPromise();
    this.http
      .post<{ sessionEstablished: boolean; expiresAt: string }>(
        this.apiUrl('/embed/authenticate-session'),
        { userId },
        {
          withCredentials: true,
          headers: {
            Authorization: `Bearer ${token}`,
            Origin: window.location.origin,
          },
        },
      )
      .subscribe({
        next: this.navigateAfterAuth,
        error: this.handleAuthError,
      });
  }

  private logout(): void {
    this.http
      .post(
        this.apiUrl('/bff/auth/logout/embed'),
        {},
        { withCredentials: true },
      )
      .subscribe({
        complete: () => {
          window.location.assign(window.location.pathname);
        },
        error: () => {
          window.location.assign(window.location.pathname);
        },
      });
  }

  private readonly navigateAfterAuth = (): void => {
    this.resolveSession?.();
    void this.router.navigate([this.afterAuthPath]);
  };

  private readonly handleAuthError = (err: unknown): void => {
    console.warn('[EmbedBootstrap] Authentication failed', err);
    this.rejectSession?.(err);
  };
}
