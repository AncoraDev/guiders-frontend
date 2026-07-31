/* eslint-disable @nx/enforce-module-boundaries */
import { Injectable, inject, signal, DestroyRef, Injector } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { ENVIRONMENT_TOKEN } from '@guiders-frontend/auth/data-access/session';
import { Message, TenantJoinedEvent, WelcomeEvent, WebSocketErrorEvent } from '@guiders-frontend/shared/types';

/**
 * Estado de cambio de chat
 */
export interface ChatStatusUpdate {
  chatId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  timestamp: string;
}

/**
 * Configuración de conexión WebSocket
 */
export interface WebSocketConfig {
  url?: string;
  path?: string;
  authToken?: string | null;
  autoConnect?: boolean;
}

/**
 * Servicio WebSocket para comunicación en tiempo real
 * 
 * Funcionalidades:
 * - Conexión/desconexión automática
 * - Unirse/salir de salas de chat
 * - Recepción de mensajes nuevos en tiempo real
 * - Notificaciones de cambios de estado
 * - Gestión de reconexiones automáticas
 * - Signals para estado reactivo
 * 
 * Basado en la arquitectura del backend:
 * - POST /v2/messages → envío HTTP
 * - WebSocket → recepción en tiempo real
 * - Salas: chat:{chatId}, chat:{chatId}:commercial
 */
@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private readonly environment = inject(ENVIRONMENT_TOKEN);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  private socket: Socket | null = null;
  private config: WebSocketConfig = {};
  /** Listeners registrados antes de que exista el socket (se aplican en connect). */
  private readonly pendingCustomListeners: Array<{
    eventName: string;
    callback: (...args: unknown[]) => void;
  }> = [];

  // ===== SIGNALS (ESTADO REACTIVO) =====
  readonly isConnected = signal<boolean>(false);
  readonly isConnecting = signal<boolean>(false);
  readonly connectionError = signal<string | null>(null);
  readonly currentRooms = signal<Set<string>>(new Set());

  // ===== SUBJECTS (STREAMS REACTIVOS) =====
  private readonly messageReceivedSubject = new BehaviorSubject<Message | null>(null);
  private readonly chatStatusSubject = new BehaviorSubject<ChatStatusUpdate | null>(null);
  private readonly connectionStateSubject = new BehaviorSubject<'connected' | 'disconnected' | 'connecting'>('disconnected');
  private readonly tenantJoinedSubject = new Subject<TenantJoinedEvent>();
  private readonly welcomeSubject = new Subject<WelcomeEvent>();
  private readonly errorSubject = new Subject<WebSocketErrorEvent>();

  // ===== OBSERVABLES PÚBLICOS =====
  readonly messageReceived$: Observable<Message | null> = this.messageReceivedSubject.asObservable();
  readonly chatStatus$: Observable<ChatStatusUpdate | null> = this.chatStatusSubject.asObservable();
  readonly connectionState$: Observable<'connected' | 'disconnected' | 'connecting'> = this.connectionStateSubject.asObservable();
  readonly tenantJoined$: Observable<TenantJoinedEvent> = this.tenantJoinedSubject.asObservable();
  readonly welcome$: Observable<WelcomeEvent> = this.welcomeSubject.asObservable();
  readonly error$: Observable<WebSocketErrorEvent> = this.errorSubject.asObservable();

  constructor() {
    // Auto-cleanup al destruir el servicio
    this.destroyRef.onDestroy(() => {
      this.disconnect();
    });
  }

  /**
   * Conectar al servidor WebSocket
   */
  connect(config: WebSocketConfig = {}): void {
    if (this.socket?.connected) {
      console.warn('[WebSocket] Ya conectado');
      return;
    }

    if (this.isConnecting()) {
      console.warn('[WebSocket] Conexión en progreso');
      return;
    }

    this.config = config;
    this.isConnecting.set(true);
    this.connectionError.set(null);
    this.connectionStateSubject.next('connecting');

    // IMPORTANTE: Socket.IO se conecta a la raíz del servidor, NO al path /api
    // Prioridad: config.url > environment.api.wsUrl > environment.api.baseUrl sin /api
    let url: string;
    if (config.url) {
      url = config.url;
    } else if (this.environment.api.wsUrl) {
      url = this.environment.api.wsUrl;
    } else {
      // Fallback: remover /api del baseUrl
      const apiBaseUrl = this.environment.api.baseUrl;
      url = apiBaseUrl.replace(/\/api$/, '');
    }
    
    const path = config.path || '/socket.io/';

    console.log('[WebSocket] Conectando a:', url, 'path:', path);

    // Configuración del cliente Socket.IO
    this.socket = io(url, {
      path,
      transports: ['websocket', 'polling'],
      withCredentials: true, // Importante para cookies
      auth: config.authToken ? { token: config.authToken } : undefined,
      autoConnect: config.autoConnect ?? true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    this.setupEventListeners();
    this.flushPendingCustomListeners();
  }

  /**
   * Desconectar del servidor WebSocket
   */
  disconnect(): void {
    if (this.socket) {
      console.log('[WebSocket] Desconectando...');
      
      // Limpiar salas antes de desconectar
      this.currentRooms().forEach(roomId => {
        this.leaveRoom(roomId);
      });

      this.socket.disconnect();
      this.socket.removeAllListeners();
      this.socket = null;
    }

    this.isConnected.set(false);
    this.isConnecting.set(false);
    this.connectionStateSubject.next('disconnected');
    this.currentRooms.set(new Set());
  }

  /**
   * Unirse a una sala de chat
   */
  joinRoom(chatId: string): void {
    if (!this.socket?.connected) {
      console.error('[WebSocket] No conectado. Usa connect() primero.');
      return;
    }

    const roomId = `chat:${chatId}`;
    console.log('📡 [WebSocket] Uniéndose a sala de chat:', roomId);
    console.log('   💬 Chat ID:', chatId);
    console.log('   🔌 Socket ID:', this.socket?.id);

    this.socket.emit('chat:join', { chatId });

    // Actualizar estado local
    const rooms = new Set(this.currentRooms());
    rooms.add(roomId);
    this.currentRooms.set(rooms);

    console.log('✅ [WebSocket] Evento chat:join emitido para:', roomId);
  }

  /**
   * Unirse a múltiples salas de chat simultáneamente
   * Útil para suscribirse a todos los chats del usuario al iniciar
   */
  joinMultipleRooms(chatIds: string[]): void {
    if (!this.socket?.connected) {
      console.error('[WebSocket] No conectado. Usa connect() primero.');
      return;
    }

    if (chatIds.length === 0) {
      console.warn('[WebSocket] No hay chats para unirse');
      return;
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log(`💬 [WebSocket] UNIÉNDOSE A ${chatIds.length} SALAS DE CHAT`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 Lista de Chat IDs:');
    chatIds.forEach((chatId, idx) => {
      console.log(`   ${idx + 1}. chat:${chatId}`);
    });
    console.log('═══════════════════════════════════════════════════════════');

    // Emitir evento para cada chat
    chatIds.forEach(chatId => {
      this.socket?.emit('chat:join', { chatId });
    });

    // Actualizar estado local
    const rooms = new Set(this.currentRooms());
    chatIds.forEach(chatId => {
      rooms.add(`chat:${chatId}`);
    });
    this.currentRooms.set(rooms);

    console.log(`✅ [WebSocket] Suscrito a ${chatIds.length} chats para notificaciones en tiempo real`);
    console.log('═══════════════════════════════════════════════════════════');
  }

  /**
   * Obtener lista de chats activos (IDs sin prefijo)
   */
  getActiveChats(): string[] {
    return Array.from(this.currentRooms())
      .filter(roomId => roomId.startsWith('chat:'))
      .map(roomId => roomId.replace('chat:', ''));
  }

  /**
   * Mostrar resumen de todas las salas activas (útil para debugging)
   */
  logActiveRooms(): void {
    const rooms = Array.from(this.currentRooms());

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 [WebSocket] RESUMEN DE SALAS ACTIVAS');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔌 Socket conectado:', this.socket?.connected);
    console.log('🆔 Socket ID:', this.socket?.id);
    console.log('📊 Total de salas:', rooms.length);
    console.log('');

    if (rooms.length === 0) {
      console.log('⚠️  No hay salas activas');
    } else {
      // Agrupar por tipo de sala
      const chatRooms = rooms.filter(r => r.startsWith('chat:'));
      const presenceRooms = rooms.filter(r => r.includes(':') && !r.startsWith('chat:') && !r.startsWith('tenant:'));
      const tenantRooms = rooms.filter(r => r.startsWith('tenant:'));

      if (chatRooms.length > 0) {
        console.log('💬 SALAS DE CHAT:', chatRooms.length);
        chatRooms.forEach((room, idx) => {
          console.log(`   ${idx + 1}. ${room}`);
        });
        console.log('');
      }

      if (presenceRooms.length > 0) {
        console.log('👤 SALAS DE PRESENCIA:', presenceRooms.length);
        presenceRooms.forEach((room, idx) => {
          const [type, id] = room.split(':');
          console.log(`   ${idx + 1}. ${room}`);
          console.log(`      🏷️  Type: ${type}`);
          console.log(`      👤 User ID: ${id}`);
        });
        console.log('');
      }

      if (tenantRooms.length > 0) {
        console.warn('⚠️  SALAS DE TENANT (DEPRECATED):', tenantRooms.length);
        tenantRooms.forEach((room, idx) => {
          console.warn(`   ${idx + 1}. ${room} ❌ DEPRECATED`);
        });
        console.log('');
      }
    }

    console.log('═══════════════════════════════════════════════════════════');
  }

  /**
   * Salir de una sala de chat
   */
  leaveRoom(chatId: string): void {
    if (!this.socket?.connected) {
      return;
    }

    // Acepta "uuid" o "chat:uuid"
    const bareId = chatId.startsWith('chat:') ? chatId.slice(5) : chatId;
    const roomId = `chat:${bareId}`;
    console.log('[WebSocket] Saliendo de sala:', roomId);

    this.socket.emit('chat:leave', { chatId: bareId });

    // Actualizar estado local
    const rooms = new Set(this.currentRooms());
    rooms.delete(roomId);
    this.currentRooms.set(rooms);
  }

  /**
   * Salir de todas las salas de chat (p.ej. al pasar a Desconectado).
   * Mantiene el socket y rooms de tenant/presencia.
   */
  leaveAllChatRooms(): void {
    const chatIds = this.getActiveChats();
    if (chatIds.length === 0) {
      return;
    }
    console.log(
      `[WebSocket] Saliendo de ${chatIds.length} salas de chat (presencia offline)`,
    );
    chatIds.forEach((id) => this.leaveRoom(id));
  }

  /**
   * Unirse a la sala de presencia personal (comercial o visitante)
   * Los eventos presence:changed se emiten a estas salas
   */
  joinPresenceRoom(userId: string, userType: 'commercial' | 'visitor'): void {
    if (!this.socket?.connected) {
      console.error('[WebSocket] No conectado. Usa connect() primero.');
      return;
    }

    const roomId = `${userType}:${userId}`;
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📡 [WebSocket] UNIÉNDOSE A SALA DE PRESENCIA');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('   👤 User ID:', userId);
    console.log('   🏷️  User Type:', userType);
    console.log('   🚪 Room ID:', roomId);
    console.log('   🔌 Socket Connected:', this.socket?.connected);
    console.log('   🆔 Socket ID:', this.socket?.id);
    console.log('═══════════════════════════════════════════════════════════');

    this.socket.emit('presence:join', { userId, userType });

    // Actualizar estado local
    const rooms = new Set(this.currentRooms());
    rooms.add(roomId);
    this.currentRooms.set(rooms);

    console.log('✅ [WebSocket] Evento presence:join emitido');
    console.log('📋 [WebSocket] Salas actuales:', Array.from(rooms));
    console.log('═══════════════════════════════════════════════════════════');
  }

  /**
   * Unirse a la sala de presencia del tenant
   *
   * @deprecated Esta funcionalidad ya NO se usa para el inbox y chat widget.
   * El backend ahora filtra automáticamente los eventos presence:changed
   * para que el comercial solo reciba eventos de visitantes con chats activos.
   * Solo usar para casos especiales (ej: tabla de visitantes).
   *
   * Nueva arquitectura:
   * - Los comerciales se unen SOLO a: commercial:${commercialId}
   * - El backend emite eventos presence:changed filtrados a esa sala
   * - NO es necesario unirse a tenant:${tenantId} para inbox/chat
   */
  joinTenantPresenceRoom(tenantId: string): void {
    if (!this.socket?.connected) {
      console.error('[WebSocket] No conectado. Usa connect() primero.');
      return;
    }

    const roomId = `tenant:${tenantId}`;
    console.log('[WebSocket] Uniéndose a sala de presencia del tenant:', roomId);
    console.warn('[WebSocket] ⚠️ ADVERTENCIA: Esta funcionalidad está deprecated para inbox/chat');

    this.socket.emit('tenant:join', { tenantId });

    // Actualizar estado local
    const rooms = new Set(this.currentRooms());
    rooms.add(roomId);
    this.currentRooms.set(rooms);
  }

  /**
   * Salir de la sala de presencia personal
   */
  leavePresenceRoom(userId: string, userType: 'commercial' | 'visitor'): void {
    if (!this.socket?.connected) {
      return;
    }

    const roomId = `${userType}:${userId}`;
    console.log('[WebSocket] Saliendo de sala de presencia:', roomId);

    this.socket.emit('presence:leave', { userId, userType });

    // Actualizar estado local
    const rooms = new Set(this.currentRooms());
    rooms.delete(roomId);
    this.currentRooms.set(rooms);
  }

  /**
   * Salir de la sala de presencia del tenant
   *
   * @deprecated Ver joinTenantPresenceRoom para más información.
   */
  leaveTenantPresenceRoom(tenantId: string): void {
    if (!this.socket?.connected) {
      return;
    }

    const roomId = `tenant:${tenantId}`;
    console.log('[WebSocket] Saliendo de sala de presencia del tenant:', roomId);

    this.socket.emit('tenant:leave', { tenantId });

    // Actualizar estado local
    const rooms = new Set(this.currentRooms());
    rooms.delete(roomId);
    this.currentRooms.set(rooms);
  }

  /**
   * Verificar si está conectado
   */
  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Obtener ID del socket actual
   */
  get socketId(): string | undefined {
    return this.socket?.id;
  }

  /**
   * Configurar listeners de eventos del socket
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Evento: Conexión exitosa
    this.socket.on('connect', () => {
      console.log('✅ [WebSocket] Conectado - Socket ID:', this.socket?.id);
      this.isConnected.set(true);
      this.isConnecting.set(false);
      this.connectionError.set(null);
      this.connectionStateSubject.next('connected');

      // DEBUG: Listener para TODOS los eventos (para diagnosticar)
      if (this.socket) {
        // Guardar referencia al socket para el listener genérico
        const socket = this.socket;

        // Socket.IO v4 usa onAny para escuchar todos los eventos
        socket.onAny((eventName: string, ...args: unknown[]) => {
          // Log de TODOS los eventos (excepto heartbeat para no saturar)
          if (!eventName.includes('heartbeat') && !eventName.includes('ping') && !eventName.includes('pong')) {
            console.log(`🔍 [WebSocket onAny] Evento: "${eventName}"`, args);
          }

          if (eventName === 'presence:changed') {
            console.log('═══════════════════════════════════════════════════════════');
            console.log('🔍 [WebSocket DEBUG] ¡¡¡EVENTO PRESENCE:CHANGED DETECTADO POR ONANY!!!');
            console.log('═══════════════════════════════════════════════════════════');
            console.log('   📋 EventName:', eventName);
            console.log('   📋 Args:', args);
            console.log('   📋 Args[0]:', args[0]);
            console.log('═══════════════════════════════════════════════════════════');
          }
        });

        console.log('✅ [WebSocket] Listener onAny configurado para detectar TODOS los eventos');
      }

      // Volver a unirse a salas anteriores
      this.rejoinRooms();

      // Mostrar resumen de salas activas después de reconectar
      setTimeout(() => {
        this.logActiveRooms();
      }, 500);
    });

    // Evento: Bienvenida del servidor
    this.socket.on('welcome', (data: WelcomeEvent) => {
      console.log('👋 [WebSocket] Bienvenida:', data.message);
      console.log('🆔 [WebSocket] Client ID:', data.clientId);
      this.welcomeSubject.next(data);
    });

    // Evento: Confirmación de unión a sala de presencia
    this.socket.on('presence:joined', (data: any) => {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('✅ [WebSocket] CONFIRMACIÓN: UNIDO A SALA DE PRESENCIA');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('   📋 Datos:', data);
      console.log('   🚪 Room:', data.roomName || data.room);
      console.log('   👤 User ID:', data.userId);
      console.log('   🏷️  User Type:', data.userType);
      console.log('   🕐 Timestamp:', data.timestamp ? new Date(data.timestamp).toLocaleString() : 'N/A');
      console.log('═══════════════════════════════════════════════════════════');
    });

    // Evento: Unión exitosa a sala de tenant
    this.socket.on('tenant:joined', (data: TenantJoinedEvent) => {
      const joinType = data.automatic ? 'automáticamente' : 'manualmente';
      console.log(`✅ [WebSocket] ¡UNIDO ${joinType} A SALA DE EMPRESA!`);
      console.log(`   🏢 Company ID: ${data.companyId}`);
      console.log(`   📍 Room Name: ${data.roomName}`);
      console.log(`   🕐 Timestamp: ${new Date(data.timestamp).toLocaleString()}`);
      console.log('   🔔 Ahora recibirás eventos presence:changed de todos los visitantes de la empresa');
      this.tenantJoinedSubject.next(data);
    });

    // Evento: Error del servidor
    this.socket.on('error', (data: WebSocketErrorEvent) => {
      console.error('❌ [WebSocket] Error del servidor:', data.message);
      if (data.code) {
        console.error('   Código:', data.code);
      }
      this.errorSubject.next(data);
    });

    // Evento: Desconexión
    this.socket.on('disconnect', (reason) => {
      console.log('⚠️ [WebSocket] Desconectado - Razón:', reason);
      this.isConnected.set(false);
      this.isConnecting.set(false);
      this.connectionStateSubject.next('disconnected');
    });

    // Evento: Error de conexión
    this.socket.on('connect_error', (error) => {
      console.error('❌ [WebSocket] Error de conexión:', error.message);
      this.isConnected.set(false);
      this.isConnecting.set(false);
      this.connectionError.set(error.message);
      this.connectionStateSubject.next('disconnected');
    });

    // Evento: Mensaje nuevo (message:new)
    this.socket.on('message:new', (message: Message) => {
      console.log('📨 [WebSocket] Nuevo mensaje recibido');
      console.log('   💬 Chat ID:', message.chatId);
      console.log('   👤 Sender ID:', message.senderId);
      console.log('   📝 Content:', message.content?.substring(0, 50) + (message.content && message.content.length > 50 ? '...' : ''));
      this.messageReceivedSubject.next(message);
    });

    // NOTA: El evento presence:changed NO se maneja aquí
    // Lo maneja directamente el PresenceService usando websocketService.on()
    // No agregamos listener aquí para evitar bloquear la propagación del evento

    // Evento: Cambio de estado del chat (chat:status)
    this.socket.on('chat:status', (data: ChatStatusUpdate) => {
      console.log('📊 [WebSocket] Cambio de estado:', data);
      this.chatStatusSubject.next(data);
    });

    // Evento: Reconexión en progreso
    this.socket.on('reconnect_attempt', async (attemptNumber) => {
      console.log(`🔄 [WebSocket] Intento de reconexión #${attemptNumber}`);
      this.isConnecting.set(true);
      this.connectionStateSubject.next('connecting');

      // Validar sesión antes de reconectar (lazy load para evitar circular deps)
      try {
        const { SessionGuardianService } = await import('@guiders-frontend/auth/data-access/session');
        const sessionGuardian = this.injector.get(SessionGuardianService, null);

        if (sessionGuardian) {
          console.log('[WebSocket] Validando sesión antes de reconectar...');
          await sessionGuardian.ensureValidSession();
          console.log('[WebSocket] ✅ Sesión válida, continuando reconexión');
        }
      } catch (error: any) {
        console.warn('[WebSocket] No se pudo validar sesión antes de reconectar:', error.message);
        // Continuar de todas formas, el backend rechazará si no hay auth válida
      }
    });

    // Evento: Reconexión exitosa
    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`✅ [WebSocket] Reconectado después de ${attemptNumber} intentos`);
      this.isConnected.set(true);
      this.isConnecting.set(false);
      this.connectionStateSubject.next('connected');

      // Mostrar resumen de salas activas después de reconexión
      setTimeout(() => {
        this.logActiveRooms();
      }, 500);
    });

    // Evento: Falló la reconexión
    this.socket.on('reconnect_failed', () => {
      console.error('❌ [WebSocket] Falló la reconexión después de todos los intentos');
      this.connectionError.set('No se pudo reconectar después de varios intentos');
      this.connectionStateSubject.next('disconnected');
    });
  }

  /**
   * Volver a unirse a las salas después de reconectar
   */
  private rejoinRooms(): void {
    const rooms = this.currentRooms();
    if (rooms.size === 0) {
      console.log('[WebSocket] No hay salas para reconectar');
      return;
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔄 [WebSocket] RECONECTANDO A SALAS');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 Total de salas:', rooms.size);
    console.log('📋 Lista:', Array.from(rooms));
    console.log('═══════════════════════════════════════════════════════════');

    rooms.forEach(roomId => {
      if (roomId.startsWith('chat:')) {
        // Sala de chat
        const chatId = roomId.replace('chat:', '');
        console.log('💬 [WebSocket] Reconectando a sala de CHAT:', roomId);
        this.socket?.emit('chat:join', { chatId });
      } else if (roomId.startsWith('tenant:')) {
        // DEPRECATED: Sala de presencia del tenant
        // Ya no se usa para inbox/chat. Solo para casos especiales (tabla de visitantes).
        console.warn('═══════════════════════════════════════════════════════════');
        console.warn('⚠️ [WebSocket] DETECTADA SALA DE TENANT (DEPRECATED)');
        console.warn('═══════════════════════════════════════════════════════════');
        console.warn('🚪 Room ID:', roomId);
        console.warn('❌ Acción: NO se reconectará (deprecated para inbox/chat)');
        console.warn('💡 Recomendación: Usar solo commercial:${id} para presencia');
        console.warn('═══════════════════════════════════════════════════════════');

        // Remover del estado local para evitar intentos futuros
        const updatedRooms = new Set(this.currentRooms());
        updatedRooms.delete(roomId);
        this.currentRooms.set(updatedRooms);
      } else if (roomId.includes(':')) {
        // Sala de presencia personal (commercial: o visitor:)
        const [userType, userId] = roomId.split(':');
        console.log('👤 [WebSocket] Reconectando a sala de PRESENCIA:', roomId);
        console.log('   🏷️  User Type:', userType);
        console.log('   👤 User ID:', userId);
        this.socket?.emit('presence:join', { userId, userType });
      }
    });

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ [WebSocket] Proceso de reconexión a salas completado');
    console.log('═══════════════════════════════════════════════════════════');
  }

  /**
   * Emitir evento personalizado (uso avanzado)
   */
  emit(eventName: string, data: unknown): void {
    if (!this.socket?.connected) {
      console.error('[WebSocket] No conectado. No se puede emitir:', eventName);
      return;
    }

    this.socket.emit(eventName, data);
  }

  /**
   * Escuchar evento personalizado (uso avanzado)
   */
  on(eventName: string, callback: (...args: unknown[]) => void): void {
    if (!this.socket) {
      console.warn(
        `[WebSocket] Socket no listo — listener "${eventName}" en cola`,
      );
      this.pendingCustomListeners.push({ eventName, callback });
      return;
    }

    console.log(`[WebSocket] 📡 Registrando listener para evento: "${eventName}"`);
    this.socket.on(eventName, callback);
    console.log(`[WebSocket] ✅ Listener registrado para: "${eventName}"`);
  }

  /**
   * Dejar de escuchar evento personalizado
   */
  off(eventName: string, callback?: (...args: unknown[]) => void): void {
    for (let i = this.pendingCustomListeners.length - 1; i >= 0; i--) {
      const pending = this.pendingCustomListeners[i];
      if (pending.eventName !== eventName) continue;
      if (!callback || pending.callback === callback) {
        this.pendingCustomListeners.splice(i, 1);
      }
    }

    if (!this.socket) return;

    if (callback) {
      this.socket.off(eventName, callback);
    } else {
      this.socket.off(eventName);
    }
  }

  private flushPendingCustomListeners(): void {
    if (!this.socket || this.pendingCustomListeners.length === 0) return;
    const pending = [...this.pendingCustomListeners];
    this.pendingCustomListeners.length = 0;
    for (const { eventName, callback } of pending) {
      this.socket.on(eventName, callback);
      console.log(
        `[WebSocket] ✅ Listener en cola aplicado: "${eventName}"`,
      );
    }
  }
}
