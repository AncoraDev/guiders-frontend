import { Injectable, inject, DestroyRef } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError, EMPTY, of } from 'rxjs';
import { catchError, map, tap, timeout } from 'rxjs/operators';
import { ENVIRONMENT_TOKEN, UserService } from '@guiders-frontend/auth/data-access/session';
import { WebSocketService } from '@guiders-frontend/chat/data-access/websocket-service';
import {
  ConnectionStatus,
  CommercialMetadata,
  ConnectCommercialRequest,
  DisconnectCommercialRequest,
  UpdateStatusRequest,
  CommercialInfo,
  ApiResponse,
  CommercialStatusResponse
} from './commercial-presence.types';

/**
 * Servicio de presencia para comerciales
 *
 * Gestiona la conexión y desconexión de comerciales en tiempo real.
 * Implementa reconexión automática y manejo de errores.
 *
 * @see {@link https://github.com/tu-repo/docs/guia-integracion-frontend.md} Guía de Integración
 */
@Injectable({
  providedIn: 'root'
})
export class CommercialPresenceService {
  private readonly http = inject(HttpClient);
  private readonly environment = inject(ENVIRONMENT_TOKEN);
  private readonly userService = inject(UserService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly webSocketService = inject(WebSocketService);
  private readonly baseUrl = `${this.environment.api.baseUrl}/v2/commercials`;

  // Estado de conexión
  private readonly isConnectedSubject = new BehaviorSubject<boolean>(false);
  private readonly connectionStatusSubject = new BehaviorSubject<ConnectionStatus>('offline');
  private readonly lastActivitySubject = new BehaviorSubject<Date | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);

  // Observables públicos
  readonly isConnected$ = this.isConnectedSubject.asObservable();
  readonly connectionStatus$ = this.connectionStatusSubject.asObservable();
  readonly lastActivity$ = this.lastActivitySubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  // Información del comercial
  private commercialId: string | null = null;
  private commercialName: string | null = null;

  // Métricas y debugging
  private reconnectAttempts = 0;
  private connectionStartTime: Date | null = null;

  // Reconexión automática por actividad del usuario
  private autoReconnectEnabled = false;
  private lastUserActivityTime = 0;
  private readonly USER_ACTIVITY_DEBOUNCE_MS = 2000; // 2 segundos de debounce
  private reconnectingFromActivity = false;

  // Emisión de actividad vía WebSocket
  private lastActivityEmissionTime = 0;
  private readonly ACTIVITY_THROTTLE_MS = 30000; // 30 segundos de throttle
  private activityListenersEnabled = false;

  /** Chats abandonados al pasar a offline — se re-unen al conectar */
  private leftChatIdsOnDisconnect: string[] = [];

  constructor() {
    // Manejar cierre de pestaña/navegador
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
    }

    // Limpiar al destruir el servicio
    this.destroyRef.onDestroy(() => {
      this.cleanup();
    });
  }

  /**
   * Conectar comercial al sistema
   */
  connect(commercialId?: string, commercialName?: string): Observable<CommercialInfo> {
    // Obtener ID del usuario desde UserService si no se proporciona
    const userId = commercialId || this.userService.getUserId();
    const user = this.userService.currentUser();
    const userName = commercialName || user?.email || 'Comercial';

    if (!userId) {
      const error = 'No se pudo obtener el ID del comercial. Asegúrate de estar autenticado.';
      console.error('[CommercialPresenceService]', error);
      this.errorSubject.next(error);
      return throwError(() => new Error(error));
    }

    // Guardar información del comercial
    this.commercialId = userId;
    this.commercialName = userName;

    // Siempre POST /connect (no early-return): cada toggle debe refrescar Redis + eventos
    const request: ConnectCommercialRequest = {
      id: userId,
      name: userName,
      metadata: this.getMetadata()
    };

    const timestamp = new Date().toISOString();
    const endpoint = `${this.baseUrl}/connect`;

    console.group(`[CommercialPresenceService] 🔌 CONNECT - ${timestamp}`);
    console.log('📤 Request:', {
      endpoint,
      method: 'POST',
      commercialId: userId,
      commercialName: userName,
      metadata: request.metadata,
      hasAuthToken: true // autenticación vía cookie BFF
    });
    console.groupEnd();

    // Optimista: UI online al instante; el HTTP confirma
    this.isConnectedSubject.next(true);
    this.connectionStatusSubject.next('online');

    return this.http.post<ApiResponse<CommercialInfo>>(
      endpoint,
      request,
      this.getHttpOptions()
    ).pipe(
      timeout(10000),
      tap(() => {
        console.log('[CommercialPresenceService] 🔄 Petición enviada, esperando respuesta...');
      }),
      map(response => {
        console.group(`[CommercialPresenceService] 📥 CONNECT Response - ${new Date().toISOString()}`);
        console.log('Response:', response);
        console.groupEnd();

        if (!response.success || !response.commercial) {
          throw new Error(response.message || 'Error al conectar comercial');
        }
        return response.commercial;
      }),
      tap(commercial => {
        this.connectionStartTime = new Date();
        this.reconnectAttempts = 0;
        this.isConnectedSubject.next(true);
        // API a veces devuelve CONNECTED; normalizar a ConnectionStatus
        const status = this.normalizeStatus(commercial.connectionStatus);
        this.connectionStatusSubject.next(status === 'offline' ? 'online' : status);
        this.lastActivitySubject.next(new Date(commercial.lastActivity));
        this.errorSubject.next(null);

        // Actividad WS (typing/heartbeat) — sin auto-reconnect de presencia
        this.enableActivityListeners();

        // Recuperar salas de chat abandonadas al desconectar
        if (this.leftChatIdsOnDisconnect.length > 0) {
          try {
            this.webSocketService.joinMultipleRooms(this.leftChatIdsOnDisconnect);
            console.log(
              '[CommercialPresenceService] 🔄 Re-unido a',
              this.leftChatIdsOnDisconnect.length,
              'chats',
            );
          } catch (err) {
            console.warn(
              '[CommercialPresenceService] No se pudieron re-unir salas de chat:',
              err,
            );
          }
          this.leftChatIdsOnDisconnect = [];
        }

        console.group(`[CommercialPresenceService] ✅ CONECTADO EXITOSAMENTE`);
        console.log('🆔 Commercial ID:', commercial.id);
        console.log('👤 Nombre:', commercial.name);
        console.log('🟢 Estado:', status);
        console.log('⏰ Última actividad:', commercial.lastActivity);
        console.log('📊 Está activo:', commercial.isActive);
        console.log('🕐 Hora de conexión:', this.connectionStartTime.toISOString());
        console.groupEnd();
      }),
      catchError(error => {
        // Resetear estado de conexión en caso de error
        this.isConnectedSubject.next(false);
        this.connectionStatusSubject.next('offline');
        return this.handleError('Error al conectar comercial', error);
      })
    );
  }

  /**
   * Al arrancar Console: fuerza offline en backend (limpia residual Redis)
   * y deja el estado local en desconectado. No requiere haber hecho connect() antes.
   */
  ensureOfflineOnBoot(): Observable<void> {
    const userId = this.userService.getUserId();
    if (!userId) {
      this.isConnectedSubject.next(false);
      this.connectionStatusSubject.next('offline');
      return EMPTY;
    }

    this.commercialId = userId;
    this.disableAutoReconnectOnActivity();

    const request: DisconnectCommercialRequest = { id: userId };
    return this.http
      .post<ApiResponse>(`${this.baseUrl}/disconnect`, request, this.getHttpOptions())
      .pipe(
        map(() => void 0),
        tap(() => {
          this.isConnectedSubject.next(false);
          this.connectionStatusSubject.next('offline');
          this.connectionStartTime = null;
          console.log(
            '[CommercialPresenceService] ⚫ Offline al arrancar (presencia manual)'
          );
        }),
        catchError(() => {
          this.isConnectedSubject.next(false);
          this.connectionStatusSubject.next('offline');
          return EMPTY;
        })
      );
  }

  /**
   * Desconectar comercial del sistema.
   * Actualiza el estado local de inmediato (optimista) para que la UI no se quede colgada
   * esperando Redis/Mongo/WS; el HTTP sincroniza el backend en segundo plano.
   */
  disconnect(options?: { reason?: 'manual' | 'logout' | 'browser_close' }): Observable<void> {
    const id = this.commercialId || this.userService.getUserId();
    if (!id) {
      console.warn('[CommercialPresenceService] ⚠️ Sin commercialId para desconectar');
      this.applyOfflineLocally();
      return of(void 0);
    }

    this.commercialId = id;
    this.disableAutoReconnectOnActivity();

    const timestamp = new Date().toISOString();
    const sessionDuration = this.connectionStartTime
      ? Math.round((new Date().getTime() - this.connectionStartTime.getTime()) / 1000)
      : 0;

    // UI inmediata: no esperar al round-trip del backend
    this.applyOfflineLocally();

    const request: DisconnectCommercialRequest = {
      id,
      ...(options?.reason ? { reason: options.reason } : {}),
    };

    const endpoint = `${this.baseUrl}/disconnect`;

    console.group(`[CommercialPresenceService] 👋 DISCONNECT - ${timestamp}`);
    console.log('📤 Request:', {
      endpoint,
      method: 'POST',
      commercialId: this.commercialId,
      sessionDuration: `${sessionDuration}s (${Math.round(sessionDuration / 60)}min)`,
      hasAuthToken: true // autenticación vía cookie BFF
    });
    console.groupEnd();

    return this.http.post<ApiResponse>(
      endpoint,
      request,
      this.getHttpOptions()
    ).pipe(
      timeout(10000),
      map(response => {
        console.group(`[CommercialPresenceService] 📥 DISCONNECT Response`);
        console.log('Response:', response);
        console.groupEnd();

        if (!response?.success) {
          console.warn('[CommercialPresenceService] ⚠️ Error al desconectar, pero UI ya está offline');
        }
        return void 0;
      }),
      tap(() => {
        console.group('[CommercialPresenceService] ✅ DESCONECTADO EXITOSAMENTE');
        console.log('🆔 Commercial ID:', this.commercialId);
        console.log('⏱️ Duración de sesión:', `${sessionDuration}s (${Math.round(sessionDuration / 60)}min)`);
        console.log('🔄 Intentos de reconexión:', this.reconnectAttempts);
        console.groupEnd();

        this.reconnectAttempts = 0;
        this.connectionStartTime = null;
      }),
      catchError(error => {
        console.group('[CommercialPresenceService] ❌ DISCONNECT ERROR / TIMEOUT');
        console.error('Error:', error);
        console.log('ℹ️ UI ya marcada offline; no bloqueamos el toggle');
        console.groupEnd();
        return of(void 0);
      })
    );
  }

  /** Estado local offline + cleanup de listeners (sin HTTP). */
  private applyOfflineLocally(): void {
    this.disableActivityListeners();
    this.isConnectedSubject.next(false);
    this.connectionStatusSubject.next('offline');
    this.lastActivitySubject.next(null);
    // Dejar de recibir/emitir en salas de chat mientras está Desconectado
    try {
      const active = this.webSocketService.getActiveChats();
      if (active.length > 0) {
        this.leftChatIdsOnDisconnect = active;
        this.webSocketService.leaveAllChatRooms();
      }
    } catch (err) {
      console.warn(
        '[CommercialPresenceService] No se pudieron abandonar salas de chat:',
        err,
      );
    }
  }

  /**
   * Cambiar estado de conexión del comercial
   */
  updateStatus(status: ConnectionStatus): Observable<CommercialInfo> {
    if (!this.commercialId) {
      const error = 'No hay comercial conectado para actualizar estado';
      console.error('[CommercialPresenceService]', error);
      return throwError(() => new Error(error));
    }

    const previousStatus = this.connectionStatusSubject.value;
    const timestamp = new Date().toISOString();

    const request: UpdateStatusRequest = {
      id: this.commercialId,
      status
    };

    const endpoint = `${this.baseUrl}/status`;

    console.group(`[CommercialPresenceService] 🔄 UPDATE STATUS - ${timestamp}`);
    console.log('📤 Request:', {
      endpoint,
      method: 'PUT',
      commercialId: this.commercialId,
      previousStatus,
      newStatus: status,
      hasAuthToken: true // autenticación vía cookie BFF
    });
    console.groupEnd();

    return this.http.put<ApiResponse<CommercialInfo>>(
      endpoint,
      request,
      this.getHttpOptions()
    ).pipe(
      map(response => {
        console.group(`[CommercialPresenceService] 📥 UPDATE STATUS Response`);
        console.log('Response:', response);
        console.groupEnd();

        if (!response.success || !response.commercial) {
          throw new Error(response.message || 'Error al actualizar estado');
        }
        return response.commercial;
      }),
      tap(commercial => {
        this.connectionStatusSubject.next(commercial.connectionStatus);

        console.group('[CommercialPresenceService] ✅ ESTADO ACTUALIZADO');
        console.log('🆔 Commercial ID:', this.commercialId);
        console.log('🔄 Estado anterior:', previousStatus);
        console.log('🟢 Estado nuevo:', commercial.connectionStatus);
        console.log('📊 Está activo:', commercial.isActive);
        console.log('⏰ Última actividad:', commercial.lastActivity);
        console.groupEnd();
      }),
      catchError(error => this.handleError('Error al actualizar estado', error))
    );
  }

  /**
   * Consultar estado de conexión actual
   */
  getStatus(commercialId?: string): Observable<CommercialInfo> {
    const id = commercialId || this.commercialId;

    if (!id) {
      const error = 'No se proporcionó ID de comercial';
      console.error('[CommercialPresenceService]', error);
      return throwError(() => new Error(error));
    }

    return this.http.get<CommercialStatusResponse>(
      `${this.baseUrl}/${id}/status`,
      this.getHttpOptions()
    ).pipe(
      map(response => ({
        id: response.commercialId,
        name: this.commercialName || 'Comercial',
        connectionStatus: response.connectionStatus,
        lastActivity: response.lastActivity,
        isActive: response.isActive
      })),
      catchError(error => this.handleError('Error al consultar estado', error))
    );
  }

  /**
   * Obtener estado actual (síncrono)
   */
  getCurrentStatus(): {
    isConnected: boolean;
    status: ConnectionStatus;
    lastActivity: Date | null;
  } {
    return {
      isConnected: this.isConnectedSubject.value,
      status: this.connectionStatusSubject.value,
      lastActivity: this.lastActivitySubject.value
    };
  }

  /**
   * Obtener métricas y estado de debug (síncrono)
   * Útil para debugging y monitoreo
   */
  getDebugInfo(): {
    // Estado de conexión
    isConnected: boolean;
    status: ConnectionStatus;
    commercialId: string | null;
    commercialName: string | null;

    // Timing
    connectionStartTime: Date | null;
    lastActivity: Date | null;
    sessionDuration: number | null; // en segundos

    // Métricas
    reconnectAttempts: number;

    // Configuración
    baseUrl: string;
    hasAuthToken: boolean;
  } {
    const now = new Date();
    const sessionDuration = this.connectionStartTime
      ? Math.round((now.getTime() - this.connectionStartTime.getTime()) / 1000)
      : null;

    return {
      // Estado de conexión
      isConnected: this.isConnectedSubject.value,
      status: this.connectionStatusSubject.value,
      commercialId: this.commercialId,
      commercialName: this.commercialName,

      // Timing
      connectionStartTime: this.connectionStartTime,
      lastActivity: this.lastActivitySubject.value,
      sessionDuration,

      // Métricas
      reconnectAttempts: this.reconnectAttempts,

      // Configuración
      baseUrl: this.baseUrl,
      hasAuthToken: true // autenticación vía cookie BFF
    };
  }

  /**
   * Imprimir estado de debug en consola
   */
  printDebugInfo(): void {
    const info = this.getDebugInfo();

    console.group('[CommercialPresenceService] 📊 DEBUG INFO');
    console.log('═════════════════════════════════════════════');
    console.log('🔌 ESTADO DE CONEXIÓN');
    console.log('  Conectado:', info.isConnected ? '✅' : '❌');
    console.log('  Estado:', info.status);
    console.log('  Commercial ID:', info.commercialId || 'N/A');
    console.log('  Nombre:', info.commercialName || 'N/A');
    console.log('═════════════════════════════════════════════');
    console.log('⏱️ TIMING');
    console.log('  Inicio de sesión:', info.connectionStartTime?.toISOString() || 'N/A');
    console.log('  Última actividad:', info.lastActivity?.toISOString() || 'N/A');
    console.log('  Duración de sesión:', info.sessionDuration ? `${info.sessionDuration}s (${Math.round(info.sessionDuration / 60)}min)` : 'N/A');
    console.log('═════════════════════════════════════════════');
    console.log('📊 MÉTRICAS');
    console.log('  Intentos de reconexión:', info.reconnectAttempts);
    console.log('═════════════════════════════════════════════');
    console.log('⚙️ CONFIGURACIÓN');
    console.log('  Base URL:', info.baseUrl);
    console.log('  Auth Token:', info.hasAuthToken ? '✅ Presente' : '❌ No presente');
    console.log('═════════════════════════════════════════════');
    console.groupEnd();
  }

  /**
   * Habilitar reconexión automática por actividad del usuario
   * Cuando el usuario hace click, scroll, etc. y está offline, se reconectará automáticamente
   */
  enableAutoReconnectOnActivity(): void {
    if (this.autoReconnectEnabled) {
      console.warn('[CommercialPresenceService] ⚠️ Reconexión automática ya está habilitada');
      return;
    }

    this.autoReconnectEnabled = true;
    this.setupUserActivityListeners();
    console.log('[CommercialPresenceService] 🔄 Reconexión automática por actividad habilitada');
  }

  /**
   * Deshabilitar reconexión automática por actividad del usuario
   */
  disableAutoReconnectOnActivity(): void {
    if (!this.autoReconnectEnabled) {
      return;
    }

    this.autoReconnectEnabled = false;
    this.removeUserActivityListeners();
    console.log('[CommercialPresenceService] 🔄 Reconexión automática por actividad deshabilitada');
  }

  /**
   * Marcar como offline localmente (usado por CommercialStatusService)
   * No realiza peticiones HTTP, solo actualiza el estado local
   */
  markAsOffline(): void {
    console.log('[CommercialPresenceService] ⚠️ Marcado como offline localmente');
    this.isConnectedSubject.next(false);
    this.connectionStatusSubject.next('offline');
  }

  // ===== MÉTODOS PRIVADOS =====

  /**
   * Configurar listeners para actividad del usuario
   */
  private setupUserActivityListeners(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const events = ['click', 'scroll', 'keydown', 'mousemove', 'touchstart'];

    events.forEach(event => {
      document.addEventListener(event, this.handleUserActivity, { passive: true });
    });

    console.log('[CommercialPresenceService] 👂 Listeners de actividad configurados:', events.join(', '));
  }

  /**
   * Remover listeners de actividad del usuario
   */
  private removeUserActivityListeners(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const events = ['click', 'scroll', 'keydown', 'mousemove', 'touchstart'];

    events.forEach(event => {
      document.removeEventListener(event, this.handleUserActivity);
    });

    console.log('[CommercialPresenceService] 🔇 Listeners de actividad removidos');
  }

  /**
   * Manejar actividad del usuario
   */
  private handleUserActivity = (): void => {
    // Si no está habilitada la reconexión automática, ignorar
    if (!this.autoReconnectEnabled) {
      return;
    }

    // Si ya estamos conectados, no hacer nada
    if (this.isConnectedSubject.value) {
      return;
    }

    // Si ya estamos intentando reconectar, no duplicar
    if (this.reconnectingFromActivity) {
      return;
    }

    // Implementar debounce: solo reconectar si han pasado al menos 2 segundos
    const now = Date.now();
    const timeSinceLastActivity = now - this.lastUserActivityTime;

    if (timeSinceLastActivity < this.USER_ACTIVITY_DEBOUNCE_MS) {
      return;
    }

    this.lastUserActivityTime = now;

    // Verificar que tengamos los datos del comercial
    if (!this.commercialId || !this.commercialName) {
      console.warn('[CommercialPresenceService] ⚠️ No hay datos del comercial para reconectar');
      return;
    }

    // Intentar reconectar
    console.log('[CommercialPresenceService] 🔄 Detectada actividad del usuario estando offline, reconectando...');
    this.reconnectingFromActivity = true;

    this.connect(this.commercialId, this.commercialName).subscribe({
      next: () => {
        console.log('[CommercialPresenceService] ✅ Reconexión por actividad exitosa');
        this.reconnectingFromActivity = false;
      },
      error: (error) => {
        console.error('[CommercialPresenceService] ❌ Error al reconectar por actividad:', error);
        this.reconnectingFromActivity = false;
      }
    });
  };

  /**
   * Manejar cierre de pestaña/navegador
   */
  private handleBeforeUnload(): void {
    const id = this.commercialId || this.userService.getUserId();
    if (this.isConnectedSubject.value && id) {
      const sessionDuration = this.connectionStartTime
        ? Math.round((new Date().getTime() - this.connectionStartTime.getTime()) / 1000)
        : 0;

      // Usar sendBeacon para garantizar que se envíe incluso al cerrar
      const request: DisconnectCommercialRequest = {
        id,
        reason: 'browser_close',
      };

      const blob = new Blob([JSON.stringify(request)], { type: 'application/json' });
      const beaconSent = navigator.sendBeacon(`${this.baseUrl}/disconnect`, blob);

      console.group('[CommercialPresenceService] 📡 BEFOREUNLOAD - Cerrando pestaña/navegador');
      console.log('🆔 Commercial ID:', this.commercialId);
      console.log('⏱️ Duración de sesión:', `${sessionDuration}s (${Math.round(sessionDuration / 60)}min)`);
      console.log('📡 Beacon enviado:', beaconSent ? '✅' : '❌');
      console.log('🌐 Endpoint:', `${this.baseUrl}/disconnect`);
      console.groupEnd();
    }
  }

  /**
   * Habilitar listeners de actividad para emitir user:activity vía WebSocket
   */
  private enableActivityListeners(): void {
    if (typeof window === 'undefined' || this.activityListenersEnabled) {
      return;
    }

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

    events.forEach(event => {
      document.addEventListener(event, this.emitUserActivity, { passive: true });
    });

    this.activityListenersEnabled = true;
    console.log('[CommercialPresenceService] 📡 Listeners de actividad WebSocket habilitados');
  }

  /**
   * Deshabilitar listeners de actividad WebSocket
   */
  private disableActivityListeners(): void {
    if (typeof window === 'undefined' || !this.activityListenersEnabled) {
      return;
    }

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

    events.forEach(event => {
      document.removeEventListener(event, this.emitUserActivity);
    });

    this.activityListenersEnabled = false;
    this.lastActivityEmissionTime = 0;
    console.log('[CommercialPresenceService] 🔇 Listeners de actividad WebSocket deshabilitados');
  }

  /**
   * Emitir actividad del usuario vía WebSocket con throttle de 30s
   */
  private emitUserActivity = (): void => {
    // Solo emitir si estamos conectados
    if (!this.isConnectedSubject.value) {
      return;
    }

    // Implementar throttle: solo emitir cada 30 segundos
    const now = Date.now();
    const timeSinceLastEmission = now - this.lastActivityEmissionTime;

    if (timeSinceLastEmission < this.ACTIVITY_THROTTLE_MS) {
      return;
    }

    this.lastActivityEmissionTime = now;

    // Emitir evento user:activity vía WebSocket
    this.webSocketService.emit('user:activity', {
      commercialId: this.commercialId,
      timestamp: new Date().toISOString()
    });

    // Actualizar última actividad local
    this.lastActivitySubject.next(new Date());

    console.log('[CommercialPresenceService] 📡 user:activity emitido vía WebSocket');
  };

  private normalizeStatus(raw: string | ConnectionStatus | undefined): ConnectionStatus {
    const value = String(raw ?? 'offline').toLowerCase();
    if (value === 'connected' || value === 'online') return 'online';
    if (value === 'away' || value === 'busy' || value === 'chatting') {
      return value;
    }
    return 'offline';
  }

  /**
   * Limpiar recursos
   */
  private cleanup(): void {
    this.removeUserActivityListeners();
    this.disableActivityListeners();

    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.handleBeforeUnload.bind(this));
    }
  }

  /**
   * Obtener metadata del navegador
   */
  private getMetadata(): CommercialMetadata {
    if (typeof window === 'undefined') {
      return {};
    }

    return {
      browser: navigator.userAgent,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }

  /**
   * Configuración de headers HTTP
   * Nota: el header Authorization lo adjunta automáticamente el authInterceptor()
   * de angular-auth-oidc-client. No añadir Bearer manualmente aquí.
   */
  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json'
    });
  }

  /**
   * Configuración de opciones HTTP
   */
  private getHttpOptions(): { headers: HttpHeaders; withCredentials: boolean } {
    return {
      headers: this.getHeaders(),
      withCredentials: true
    };
  }

  /**
   * Manejar errores HTTP
   */
  private handleError(message: string, error: unknown): Observable<never> {
    let errorMessage = message;

    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) {
        errorMessage = 'Token expirado o no válido. Por favor, inicia sesión nuevamente.';
      } else if (error.status >= 500) {
        errorMessage = `Error del servidor (${error.status}). Reintentando...`;
      } else if (error.error?.message) {
        errorMessage = error.error.message;
      }
    }

    console.error(`[CommercialPresenceService] ❌ ${message}:`, error);
    this.errorSubject.next(errorMessage);

    return throwError(() => new Error(errorMessage));
  }
}
