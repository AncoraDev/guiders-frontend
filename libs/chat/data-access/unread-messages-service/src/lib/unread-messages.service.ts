import {
  Injectable,
  inject,
  signal,
  computed,
  DestroyRef,
  Injector,
} from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, BehaviorSubject, catchError, map, of, filter } from 'rxjs';
import {
  Message,
  UnreadCountMap,
  UnreadMessagesResponse,
  MarkAsReadResponse,
} from '@guiders-frontend/shared/types';
import { ENVIRONMENT_TOKEN } from '@guiders-frontend/auth/data-access/session';
import { WebSocketService } from '@guiders-frontend/chat/data-access/websocket-service';

/**
 * UnreadMessagesService
 *
 * Servicio dedicado para gestionar el estado de mensajes no leídos en tiempo real.
 *
 * Características:
 * - Signals para estado reactivo
 * - Integración con WebSocket para actualizaciones en tiempo real
 * - API REST para obtener y marcar mensajes como leídos
 * - Notificaciones del navegador
 * - Contadores de mensajes no leídos por chat
 *
 * Basado en la arquitectura del backend:
 * - GET /v2/messages/chat/:chatId/unread
 * - PUT /v2/messages/mark-as-read
 * - PUT /v2/chats/:chatId/unread/reset
 * - WebSocket: message:new (payload includes unreadMessagesCount)
 */
@Injectable({
  providedIn: 'root',
})
export class UnreadMessagesService {
  private readonly http = inject(HttpClient);
  private readonly environment = inject(ENVIRONMENT_TOKEN);
  private readonly webSocket = inject(WebSocketService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly baseUrl = `${this.environment.api.baseUrl}/v2`;
  private router: Router | null = null;

  // ===== SIGNALS (ESTADO REACTIVO) =====

  /**
   * Mapa de contadores de mensajes no leídos por chatId
   * { 'chat-uuid-1': 3, 'chat-uuid-2': 0, ... }
   */
  readonly unreadCountMap = signal<UnreadCountMap>({});

  /**
   * Mapa de mensajes no leídos por chatId
   * { 'chat-uuid-1': [Message, Message], ... }
   */
  readonly unreadMessagesMap = signal<Record<string, Message[]>>({});

  /**
   * Total de mensajes no leídos en todos los chats
   */
  readonly totalUnreadCount = computed(() => {
    const counts = this.unreadCountMap();
    return Object.values(counts).reduce((sum, count) => sum + count, 0);
  });

  /**
   * Indica si hay mensajes no leídos
   */
  readonly hasUnreadMessages = computed(() => this.totalUnreadCount() > 0);

  /**
   * Mapa de chatId -> visitorId para agrupar contadores por visitante
   * Se pobla cuando se registran chats con registerChatVisitor()
   */
  private readonly chatToVisitorMap = signal<Record<string, string>>({});

  /**
   * Chats asignados a este comercial para notificaciones/badges.
   * null = sin filtro (comportamiento legacy hasta que Atención/Inbox sincronice).
   * Tras una transferencia, el chat sale de este set y deja de notificar.
   */
  private notifyChatIds: Set<string> | null = null;

  /**
   * Mapa de contadores de mensajes no leídos por visitorId
   * { 'visitor-uuid-1': 5, 'visitor-uuid-2': 2, ... }
   */
  readonly unreadCountByVisitor = computed(() => {
    const chatVisitorMap = this.chatToVisitorMap();
    const unreadMap = this.unreadCountMap();
    const result: Record<string, number> = {};

    for (const [chatId, count] of Object.entries(unreadMap)) {
      const visitorId = chatVisitorMap[chatId];
      if (visitorId && count > 0) {
        result[visitorId] = (result[visitorId] || 0) + count;
      }
    }

    return result;
  });

  /**
   * Estado de carga
   */
  readonly isLoading = signal<boolean>(false);

  /**
   * Error actual
   */
  readonly error = signal<string | null>(null);

  // ===== SUBJECTS (PARA COMPATIBILIDAD CON OBSERVABLES) =====
  private readonly unreadCountSubject = new BehaviorSubject<UnreadCountMap>({});
  readonly unreadCount$ = this.unreadCountSubject.asObservable();

  // ===== CONFIGURACIÓN =====
  private currentUserId: string | null = null;
  private notificationsEnabled = false;
  private soundEnabled = true; // Sonido habilitado por defecto
  private activeChatId: string | null = null; // Chat actualmente seleccionado

  // Audio para notificación (usamos un tono de notificación corto)
  private notificationSound: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private audioResumed = false;

  // ===== TÍTULO PARPADEANTE =====
  private originalTitle = '';
  private titleFlashInterval: ReturnType<typeof setInterval> | null = null;
  private isTitleFlashing = false;

  constructor() {
    console.log('[UnreadMessagesService] 🚀 === SERVICIO INICIALIZADO ===');
    console.log('[UnreadMessagesService] 📋 BaseUrl:', this.baseUrl);
    this.initializeWebSocketListenersWhenConnected();
    this.requestNotificationPermission();
    this.initializeNotificationSound();
    this.setupAudioContextResume();
  }

  private initializeWebSocketListenersWhenConnected(): void {
    if (this.webSocket.isConnected()) {
      this.initializeWebSocketListeners();
      return;
    }

    const connectionSubscription = this.webSocket.connectionState$.subscribe(
      (state) => {
        if (state === 'connected') {
          this.initializeWebSocketListeners();
          connectionSubscription.unsubscribe();
        }
      }
    );
  }

  // ===== CONFIGURACIÓN =====

  /**
   * Configurar usuario actual
   */
  setCurrentUser(userId: string): void {
    this.currentUserId = userId;
  }

  /**
   * Obtener usuario actual
   */
  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  /**
   * Establecer el chat activo (seleccionado)
   * Esto evita que se incrementen contadores y se muestren notificaciones
   * para mensajes del chat activo
   */
  setActiveChat(chatId: string | null): void {
    const previousChatId = this.activeChatId;
    this.activeChatId = chatId;

    console.log(`[UnreadMessagesService] 🔄 ===== CAMBIO DE CHAT ACTIVO =====`);
    console.log(
      `[UnreadMessagesService] 📋 Chat anterior: ${previousChatId || 'ninguno'}`
    );
    console.log(
      `[UnreadMessagesService] 📋 Chat nuevo: ${chatId || 'ninguno'}`
    );
    console.log(
      `[UnreadMessagesService] 📊 activeChatId ACTUALIZADO A: ${this.activeChatId}`
    );
    console.log(`[UnreadMessagesService] 📊 Estado actual de contadores:`, {
      ...this.unreadCountMap(),
    });

    // Si se activó un chat, marcar sus mensajes no leídos como leídos automáticamente
    if (chatId) {
      console.log(
        `[UnreadMessagesService] ✅ Iniciando markActiveChatAsRead para: ${chatId}`
      );
      this.markActiveChatAsRead(chatId);
      // Notify the server to reset the persistent unread counter in MongoDB.
      this.resetUnreadCountOnServer(chatId);
    } else {
      console.log(
        `[UnreadMessagesService] ⚠️ Chat desactivado (cerrado), no hay chat activo`
      );
    }

    console.log(
      `[UnreadMessagesService] 🎯 ===== FIN CAMBIO DE CHAT ACTIVO =====`
    );

    // Mostrar estado completo después del cambio
    this.debugState();
  }

  /**
   * Obtener el chat activo actual
   */
  getActiveChat(): string | null {
    return this.activeChatId;
  }

  /**
   * Método de debugging para ver el estado completo del servicio
   */
  debugState(): void {
    console.log(
      '[UnreadMessagesService] 🐛 ===== ESTADO ACTUAL DEL SERVICIO ====='
    );
    console.log('[UnreadMessagesService] 📋 activeChatId:', this.activeChatId);
    console.log(
      '[UnreadMessagesService] 📋 currentUserId:',
      this.currentUserId
    );
    console.log(
      '[UnreadMessagesService] 📋 notificationsEnabled:',
      this.notificationsEnabled
    );
    console.log('[UnreadMessagesService] 📊 unreadCountMap:', {
      ...this.unreadCountMap(),
    });
    console.log(
      '[UnreadMessagesService] 📨 unreadMessagesMap keys:',
      Object.keys(this.unreadMessagesMap())
    );
    console.log(
      '[UnreadMessagesService] 📊 totalUnreadCount:',
      this.totalUnreadCount()
    );
    console.log('[UnreadMessagesService] 🐛 ===== FIN ESTADO =====');
  }

  /**
   * Marcar automáticamente los mensajes del chat activo como leídos
   * Siguiendo el flujo correcto:
   * 1. Obtener mensajes no leídos del servidor (no solo locales)
   * 2. Extraer IDs
   * 3. Marcar como leídos en el servidor
   * 4. Actualizar badge a 0
   */
  private markActiveChatAsRead(chatId: string): void {
    console.log(
      `[UnreadMessagesService] 🔄 === INICIANDO RESETEO DE CONTADOR ===`
    );
    console.log(`[UnreadMessagesService] 📋 ChatId a resetear: ${chatId}`);
    console.log(
      `[UnreadMessagesService] 📊 Contador actual ANTES: ${
        this.unreadCountMap()[chatId] || 0
      }`
    );
    console.log(
      `[UnreadMessagesService] 📨 Mensajes locales no leídos:`,
      this.unreadMessagesMap()[chatId]?.length || 0
    );

    // ✅ RESETEAR CONTADOR INMEDIATAMENTE en la UI (feedback instantáneo)
    this.unreadCountMap.update((map) => {
      const newMap = { ...map, [chatId]: 0 };
      console.log(
        `[UnreadMessagesService] ✅ unreadCountMap actualizado:`,
        newMap
      );
      return newMap;
    });

    // Limpiar mensajes no leídos localmente
    this.unreadMessagesMap.update((map) => {
      const newMap = { ...map };
      delete newMap[chatId];
      console.log(
        `[UnreadMessagesService] ✅ unreadMessagesMap limpiado para chat ${chatId}`
      );
      return newMap;
    });

    // Actualizar subject
    this.unreadCountSubject.next(this.unreadCountMap());
    console.log(`[UnreadMessagesService] ✅ BehaviorSubject actualizado`);
    console.log(
      `[UnreadMessagesService] 📊 Contador actual DESPUÉS: ${
        this.unreadCountMap()[chatId] || 0
      }`
    );

    // Detener parpadeo si no hay más mensajes no leídos
    if (this.totalUnreadCount() === 0) {
      this.stopTitleFlashing();
    }

    // ✅ OBTENER MENSAJES NO LEÍDOS DEL SERVIDOR (no solo locales)
    // Esto es crítico porque puede haber mensajes no leídos que llegaron
    // mientras el comercial estaba desconectado
    // IMPORTANTE: Usar método privado que NO actualiza el estado local
    console.log(
      `[UnreadMessagesService] 🌐 Consultando servidor para mensajes no leídos (sin actualizar estado)...`
    );
    this.getUnreadMessagesWithoutStateUpdate(chatId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (unreadMessages) => {
          console.log(
            `[UnreadMessagesService] 📥 Respuesta del servidor recibida`
          );

          if (unreadMessages.length === 0) {
            console.log(
              `[UnreadMessagesService] ✅ No hay mensajes sin leer en el servidor para chat ${chatId}`
            );
            return;
          }

          console.log(
            `[UnreadMessagesService] 📋 ${unreadMessages.length} mensajes no leídos encontrados en servidor:`
          );
          console.log(
            `[UnreadMessagesService] 📋 Estructura del primer mensaje:`,
            unreadMessages[0]
          );

          // IMPORTANTE: El servidor puede devolver 'id' o 'messageId'
          // Intentar ambos campos para compatibilidad
          const messageIds = unreadMessages.map(
            (m) => (m as any).id || m.messageId
          );

          console.log(`[UnreadMessagesService] 📋 IDs extraídos:`, messageIds);
          const validIds = messageIds.filter(
            (id) => id !== undefined && id !== null
          );
          console.log(
            `[UnreadMessagesService] 📋 IDs válidos:`,
            validIds.length
          );

          if (validIds.length === 0) {
            console.warn(
              `[UnreadMessagesService] ⚠️ No se pudieron extraer IDs válidos de los mensajes`
            );
            console.warn(
              `[UnreadMessagesService] ⚠️ Verificar estructura del mensaje del servidor`
            );
            return;
          }

          // Esperar 1 segundo antes de marcar en el servidor
          console.log(
            `[UnreadMessagesService] ⏱️ Esperando 1 segundo antes de marcar como leídos...`
          );
          setTimeout(() => {
            console.log(
              `[UnreadMessagesService] 🚀 Enviando solicitud para marcar ${validIds.length} mensajes como leídos`
            );
            this.markAsRead(validIds).subscribe({
              next: (response) => {
                if (response.success) {
                  console.log(
                    `✅ [UnreadMessagesService] ${response.markedCount} mensajes marcados como leídos en el servidor`
                  );
                  console.log(
                    `[UnreadMessagesService] 🎉 === RESETEO COMPLETADO ===`
                  );
                } else {
                  console.warn(
                    `⚠️ [UnreadMessagesService] Respuesta del servidor: success=false`
                  );
                }
              },
              error: (error) => {
                console.error(
                  '[UnreadMessagesService] ❌ Error al marcar mensajes como leídos:',
                  error
                );
              },
            });
          }, 1000);
        },
        error: (error) => {
          console.error(
            '[UnreadMessagesService] ❌ Error al obtener mensajes no leídos del servidor:',
            error
          );
          console.error('[UnreadMessagesService] Error details:', error);
        },
      });
  }

  // ===== MÉTODOS PRINCIPALES =====

  /**
   * Obtener mensajes no leídos SIN actualizar el estado local
   * Usado internamente por markActiveChatAsRead para evitar incrementar el contador
   */
  private getUnreadMessagesWithoutStateUpdate(
    chatId: string
  ): Observable<Message[]> {
    console.log(
      `[UnreadMessagesService] 🌐 === LLAMANDO GET /v2/messages/chat/${chatId}/unread (SIN ACTUALIZAR ESTADO) ===`
    );

    const url = `${this.baseUrl}/messages/chat/${chatId}/unread`;
    console.log(`[UnreadMessagesService] 📋 URL completa:`, url);

    return this.http.get<Message[]>(url, this.getHttpOptions()).pipe(
      map((messages) => {
        console.log(
          `[UnreadMessagesService] 📥 Respuesta del servidor (sin actualizar estado):`,
          messages
        );

        // Transformar fechas de string a Date pero NO actualizar estado local
        const transformedMessages = messages.map((msg) => ({
          ...msg,
          sentAt: new Date(msg.sentAt),
          readAt: msg.readAt ? new Date(msg.readAt) : null,
          editedAt: msg.editedAt ? new Date(msg.editedAt) : undefined,
        }));

        console.log(
          `[UnreadMessagesService] 🔄 Mensajes transformados (sin tocar estado):`,
          transformedMessages.length
        );
        return transformedMessages;
      }),
      catchError((error) => {
        console.error(
          '[UnreadMessagesService] ❌ Error al obtener mensajes no leídos:',
          error
        );
        return of([]);
      })
    );
  }

  /**
   * Obtener mensajes no leídos para un chat específico
   * GET /v2/messages/chat/:chatId/unread
   */
  getUnreadMessages(chatId: string): Observable<Message[]> {
    console.log(
      `[UnreadMessagesService] 🌐 === LLAMANDO GET /v2/messages/chat/${chatId}/unread ===`
    );
    this.isLoading.set(true);
    this.error.set(null);

    const url = `${this.baseUrl}/messages/chat/${chatId}/unread`;
    console.log(`[UnreadMessagesService] 📋 URL completa:`, url);

    return this.http.get<Message[]>(url, this.getHttpOptions()).pipe(
      map((messages) => {
        console.log(
          `[UnreadMessagesService] 📥 Respuesta del servidor:`,
          messages
        );
        console.log(
          `[UnreadMessagesService] 📊 Total de mensajes no leídos:`,
          messages.length
        );

        // Transformar fechas de string a Date
        const transformedMessages = messages.map((msg) => ({
          ...msg,
          sentAt: new Date(msg.sentAt),
          readAt: msg.readAt ? new Date(msg.readAt) : null,
          editedAt: msg.editedAt ? new Date(msg.editedAt) : undefined,
        }));

        console.log(
          `[UnreadMessagesService] 🔄 Mensajes transformados:`,
          transformedMessages.length
        );

        // Actualizar estado local
        this.updateUnreadMessagesForChat(chatId, transformedMessages);
        this.isLoading.set(false);

        console.log(`[UnreadMessagesService] ✅ getUnreadMessages completado`);
        return transformedMessages;
      }),
      catchError((error) => {
        console.error(
          '[UnreadMessagesService] ❌ Error al obtener mensajes no leídos:',
          error
        );
        console.error('[UnreadMessagesService] ❌ Status:', error.status);
        console.error('[UnreadMessagesService] ❌ Message:', error.message);
        console.error('[UnreadMessagesService] ❌ Full error:', error);
        this.error.set('Error al cargar mensajes no leídos');
        this.isLoading.set(false);
        return of([]);
      })
    );
  }

  /**
   * Marcar mensajes como leídos
   * PUT /v2/messages/mark-as-read
   */
  markAsRead(messageIds: string[]): Observable<MarkAsReadResponse> {
    if (messageIds.length === 0) {
      return of({ success: true, markedCount: 0 });
    }

    return this.http
      .put<MarkAsReadResponse>(
        `${this.baseUrl}/messages/mark-as-read`,
        { messageIds },
        this.getHttpOptions()
      )
      .pipe(
        map((response) => {
          console.log(
            `[UnreadMessagesService] ${response.markedCount} mensajes marcados como leídos`
          );

          // Actualizar estado local: remover mensajes marcados
          this.removeMarkedMessages(messageIds);

          return response;
        }),
        catchError((error) => {
          console.error(
            '[UnreadMessagesService] Error al marcar mensajes como leídos:',
            error
          );
          this.error.set('Error al marcar mensajes como leídos');
          return of({ success: false, markedCount: 0 });
        })
      );
  }

  /**
   * Notify the server that the commercial has opened a chat and reset its unread count.
   * PUT /v2/chats/:chatId/unread/reset
   * This is fire-and-forget: the UI counter is already zeroed optimistically in setActiveChat.
   */
  private resetUnreadCountOnServer(chatId: string): void {
    this.http
      .put<{ success: boolean }>(
        `${this.baseUrl}/chats/${chatId}/unread/reset`,
        {},
        this.getHttpOptions()
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (res.success) {
            console.log(`[UnreadMessagesService] ✅ unreadCount reseteado en servidor para chat ${chatId}`);
          }
        },
        error: (err) => {
          console.warn(`[UnreadMessagesService] ⚠️ No se pudo resetear unreadCount en servidor para chat ${chatId}:`, err);
        },
      });
  }

  /**
   * Refrescar contadores de mensajes no leídos para todos los chats
   * IMPORTANTE: NO refresca el contador del chat activo para evitar conflictos
   */
  refreshUnreadCounts(chatIds: string[]): void {
    console.log(
      '[UnreadMessagesService] 🔄 Refrescando contadores para',
      chatIds.length,
      'chats'
    );
    console.log(
      '[UnreadMessagesService] 📋 Chat activo actual:',
      this.activeChatId
    );

    chatIds.forEach((chatId) => {
      // ✅ IMPORTANTE: NO refrescar el contador del chat activo
      // porque ya se está reseteando automáticamente con markActiveChatAsRead()
      if (chatId === this.activeChatId) {
        console.log(
          `[UnreadMessagesService] ⏭️ Saltando refresh para chat activo: ${chatId}`
        );
        return;
      }

      console.log(
        `[UnreadMessagesService] 🔄 Refrescando contador para chat: ${chatId}`
      );
      this.getUnreadMessages(chatId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe();
    });
  }

  /**
   * Obtener contador de mensajes no leídos para un chat específico
   */
  getUnreadCount(chatId: string): number {
    return this.unreadCountMap()[chatId] || 0;
  }

  /**
   * Obtener mensajes no leídos locales para un chat
   */
  getUnreadMessagesLocal(chatId: string): Message[] {
    return this.unreadMessagesMap()[chatId] || [];
  }

  // ===== MÉTODOS PARA BADGES POR VISITANTE =====

  /**
   * Registrar la relación entre un chat y su visitante
   * Esto permite agrupar contadores de no leídos por visitante
   */
  registerChatVisitor(chatId: string, visitorId: string): void {
    this.chatToVisitorMap.update((map) => ({
      ...map,
      [chatId]: visitorId,
    }));
  }

  /**
   * Registrar múltiples relaciones chat-visitante de una vez
   * Útil al cargar la lista de chats
   */
  registerChatsVisitors(
    chats: Array<{ chatId: string; visitorId: string }>
  ): void {
    this.chatToVisitorMap.update((map) => {
      const newMap = { ...map };
      chats.forEach(({ chatId, visitorId }) => {
        newMap[chatId] = visitorId;
      });
      return newMap;
    });
  }

  /**
   * Sincroniza la allowlist de chats que pueden generar notificaciones/badges
   * (típicamente la cola «Míos» del comercial).
   */
  syncNotifyChats(chatIds: string[]): void {
    this.notifyChatIds = new Set(chatIds.filter(Boolean));
  }

  /**
   * Deja de trackear un chat (p. ej. tras transferirlo): limpia unread local
   * y lo excluye de futuras notificaciones.
   */
  unregisterChat(chatId: string): void {
    if (!chatId) return;

    this.notifyChatIds?.delete(chatId);

    this.chatToVisitorMap.update((map) => {
      if (!(chatId in map)) return map;
      const next = { ...map };
      delete next[chatId];
      return next;
    });

    this.unreadMessagesMap.update((map) => {
      if (!(chatId in map)) return map;
      const next = { ...map };
      delete next[chatId];
      return next;
    });

    this.unreadCountMap.update((map) => {
      if (!(chatId in map)) return map;
      const next = { ...map };
      delete next[chatId];
      return next;
    });
    this.unreadCountSubject.next(this.unreadCountMap());

    if (this.totalUnreadCount() === 0) {
      this.stopTitleFlashing();
    }
  }

  private shouldNotifyForChat(chatId: string): boolean {
    if (!this.notifyChatIds) return true;
    return this.notifyChatIds.has(chatId);
  }

  /**
   * Verificar si un visitante tiene mensajes no leídos
   * (en cualquiera de sus chats asignados al comercial)
   */
  hasUnreadForVisitor(visitorId: string): boolean {
    return (this.unreadCountByVisitor()[visitorId] || 0) > 0;
  }

  /**
   * Obtener el total de mensajes no leídos para un visitante específico
   */
  getUnreadCountForVisitor(visitorId: string): number {
    return this.unreadCountByVisitor()[visitorId] || 0;
  }

  // ===== MÉTODOS PRIVADOS =====

  /**
   * Inicializar listeners de WebSocket
   */
  private initializeWebSocketListeners(): void {
    console.log(
      '[UnreadMessagesService] 🎧 Inicializando listeners de WebSocket'
    );

    // Escuchar mensajes nuevos del WebSocket
    this.webSocket.messageReceived$
      .pipe(
        filter((message): message is Message => message !== null),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((message) => {
        console.log(
          '[UnreadMessagesService] 📨 === NUEVO MENSAJE RECIBIDO POR WEBSOCKET ==='
        );
        console.log('[UnreadMessagesService] 📋 MessageId:', message.messageId);
        console.log('[UnreadMessagesService] 📋 ChatId:', message.chatId);
        console.log('[UnreadMessagesService] 📋 SenderId:', message.senderId);
        console.log(
          '[UnreadMessagesService] 📋 Content:',
          message.content.substring(0, 50) + '...'
        );

        // Solo procesar si no es mensaje propio
        if (message.senderId === this.currentUserId) {
          console.log(
            '[UnreadMessagesService] ⏭️ Mensaje propio ignorado (senderId === currentUserId)'
          );
          console.log(
            '[UnreadMessagesService] 📋 CurrentUserId:',
            this.currentUserId
          );
          return;
        }

        if (message.senderType === 'SYSTEM' || message.type === 'SYSTEM') {
          return;
        }

        // Tras transferencia (u otro release): no notificar chats que ya no son nuestros
        if (!this.shouldNotifyForChat(message.chatId)) {
          console.log(
            '[UnreadMessagesService] ⏭️ Chat no asignado a este comercial, ignorando notificación:',
            message.chatId
          );
          return;
        }

        console.log(
          '[UnreadMessagesService] ✅ Mensaje de otro usuario, procesando...'
        );

        // ✅ VERIFICAR SI ES DEL CHAT ACTIVO
        const isFromActiveChat = message.chatId === this.activeChatId;
        console.log(
          '[UnreadMessagesService] 🔍 ===== VERIFICACIÓN DE CHAT ACTIVO ====='
        );
        console.log(
          '[UnreadMessagesService] 📋 message.chatId:',
          message.chatId
        );
        console.log(
          '[UnreadMessagesService] 📋 this.activeChatId:',
          this.activeChatId
        );
        console.log(
          '[UnreadMessagesService] 📋 Son iguales?:',
          message.chatId === this.activeChatId
        );
        console.log(
          '[UnreadMessagesService] 📋 isFromActiveChat:',
          isFromActiveChat
        );
        console.log('[UnreadMessagesService] 🔍 ===== FIN VERIFICACIÓN =====');

        if (isFromActiveChat) {
          console.log(
            '[UnreadMessagesService] ✅ Mensaje del chat activo - NO incrementar contador ni notificar'
          );

          // Marcar como leído inmediatamente (chat activo visible)
          console.log(
            '[UnreadMessagesService] ⏱️ Esperando 1 segundo para marcar como leído...'
          );
          setTimeout(() => {
            console.log(
              '[UnreadMessagesService] 🚀 Marcando mensaje del chat activo como leído'
            );

            // IMPORTANTE: Usar el mismo fallback que en markActiveChatAsRead
            const messageId = (message as any).id || message.messageId;
            console.log(
              '[UnreadMessagesService] 📋 MessageId extraído:',
              messageId
            );

            if (!messageId) {
              console.error(
                '[UnreadMessagesService] ❌ No se pudo extraer messageId del mensaje del chat activo'
              );
              console.error(
                '[UnreadMessagesService] ❌ Estructura del mensaje:',
                message
              );
              return;
            }

            this.markAsRead([messageId]).subscribe({
              next: (response) => {
                if (response.success) {
                  console.log(
                    `✅ Mensaje del chat activo marcado como leído automáticamente`
                  );
                }
              },
              error: (error) => {
                console.error(
                  '[UnreadMessagesService] ❌ Error al marcar mensaje del chat activo:',
                  error
                );
              },
            });
          }, 1000);

          return; // NO incrementar contador ni mostrar notificación
        }

        // Solo si NO es del chat activo:
        console.log(
          '[UnreadMessagesService] ⚠️ Mensaje de chat INACTIVO - Incrementando contador'
        );

        // 1. Actualizar contador — preferir el valor autoritativo del servidor si viene en el payload.
        if (message.unreadMessagesCount !== undefined) {
          console.log(
            `[UnreadMessagesService] 📊 Usando unreadMessagesCount del servidor: ${message.unreadMessagesCount}`
          );
          this.unreadCountMap.update((map) => ({
            ...map,
            [message.chatId]: message.unreadMessagesCount as number,
          }));
          this.unreadCountSubject.next(this.unreadCountMap());
        } else {
          // Fallback: incrementar localmente si el backend aún no envía el campo.
          const currentCount = this.unreadCountMap()[message.chatId] || 0;
          console.log('[UnreadMessagesService] 📊 Contador ANTES (local):', currentCount);
          this.incrementUnreadCount(message.chatId);
          console.log(
            '[UnreadMessagesService] 📊 Contador DESPUÉS:',
            this.unreadCountMap()[message.chatId]
          );
        }

        // 2. Agregar a lista de mensajes no leídos
        this.addUnreadMessage(message);
        console.log(
          '[UnreadMessagesService] 📨 Mensaje agregado a lista de no leídos'
        );

        // 3. Mostrar notificación del navegador si está habilitado
        // IMPORTANTE: Mostrar notificación incluso si la app está activa,
        // porque el usuario está mirando OTRO chat (no el que recibió el mensaje)
        if (this.notificationsEnabled) {
          console.log(
            '[UnreadMessagesService] 🔔 Mostrando notificación del navegador para chat inactivo'
          );
          this.showBrowserNotification(message);
        } else {
          console.log(
            '[UnreadMessagesService] 🔕 No mostrar notificación (notificationsEnabled:',
            this.notificationsEnabled,
            ')'
          );
        }

        // 4. Iniciar parpadeo del título
        this.startTitleFlashing();

        console.log(
          `[UnreadMessagesService] 📊 === PROCESAMIENTO COMPLETADO ===`
        );
      });

    // Listen for authoritative unread count updates from the server.
    // Emitted after PUT /v2/chats/:chatId/unread/reset so the badge stays
    // in sync across sessions without polling.
    this.webSocket.on('chat:unread_count', (data: unknown) => {
      const payload = data as { chatId: string; unreadMessagesCount: number };
      if (!payload?.chatId) return;

      if (!this.shouldNotifyForChat(payload.chatId)) {
        // Chat transferido / no asignado: no actualizar badge aquí
        return;
      }

      console.log(
        `[UnreadMessagesService] 📊 chat:unread_count received — chatId: ${payload.chatId}, count: ${payload.unreadMessagesCount}`
      );

      this.unreadCountMap.update((map) => ({
        ...map,
        [payload.chatId]: payload.unreadMessagesCount,
      }));
      this.unreadCountSubject.next(this.unreadCountMap());

      if (this.totalUnreadCount() === 0) {
        this.stopTitleFlashing();
      }
    });

    // Listen for new chat creation events from the tenant room.
    // This updates the unread badge when a new chat is created for this commercial.
    this.webSocket.on('chat:created', (data: unknown) => {
      const payload = data as { chatId: string; visitorId: string; commercialId?: string };
      if (!payload?.chatId) return;

      console.log(
        `[UnreadMessagesService] 💬 chat:created received — chatId: ${payload.chatId}, visitorId: ${payload.visitorId}`
      );

      // Only process if this chat is assigned to the current commercial
      if (payload.commercialId && payload.commercialId !== this.currentUserId) {
        console.log(
          `[UnreadMessagesService] ⏭️ Chat creado para otro comercial: ${payload.commercialId}, ignorando`
        );
        return;
      }

      // Initialize unread count for the new chat
      this.unreadCountMap.update((map) => ({
        ...map,
        [payload.chatId]: 0,
      }));
    });
  }

  /**
   * Actualizar mensajes no leídos para un chat
   */
  private updateUnreadMessagesForChat(
    chatId: string,
    messages: Message[]
  ): void {
    this.unreadMessagesMap.update((map) => ({
      ...map,
      [chatId]: messages,
    }));

    this.unreadCountMap.update((map) => ({
      ...map,
      [chatId]: messages.length,
    }));

    this.unreadCountSubject.next(this.unreadCountMap());
  }

  /**
   * Incrementar contador de mensajes no leídos para un chat
   */
  private incrementUnreadCount(chatId: string): void {
    console.log(
      `[UnreadMessagesService] ➕ Incrementando contador para chat ${chatId}`
    );
    const currentCount = this.unreadCountMap()[chatId] || 0;

    this.unreadCountMap.update((map) => {
      const newMap = {
        ...map,
        [chatId]: currentCount + 1,
      };
      console.log(
        `[UnreadMessagesService] 📊 Contador actualizado: ${currentCount} -> ${newMap[chatId]}`
      );
      console.log(
        `[UnreadMessagesService] 📊 Mapa completo de contadores:`,
        newMap
      );
      return newMap;
    });

    this.unreadCountSubject.next(this.unreadCountMap());
    console.log(
      `[UnreadMessagesService] ✅ BehaviorSubject notificado con nuevos contadores`
    );
  }

  /**
   * Agregar mensaje no leído a la lista
   */
  private addUnreadMessage(message: Message): void {
    this.unreadMessagesMap.update((map) => {
      const currentMessages = map[message.chatId] || [];
      // Verificar que no exista duplicado
      const exists = currentMessages.some(
        (m) => m.messageId === message.messageId
      );
      if (exists) {
        return map;
      }

      return {
        ...map,
        [message.chatId]: [...currentMessages, message],
      };
    });
  }

  /**
   * Remover mensajes marcados como leídos del estado local
   */
  private removeMarkedMessages(messageIds: string[]): void {
    // Actualizar mensajes no leídos
    this.unreadMessagesMap.update((map) => {
      const newMap: Record<string, Message[]> = {};

      Object.entries(map).forEach(([chatId, messages]) => {
        // Filtrar mensajes que no están en la lista de marcados
        const filteredMessages = messages.filter(
          (msg) => !messageIds.includes(msg.messageId)
        );

        if (filteredMessages.length > 0) {
          newMap[chatId] = filteredMessages;
        }
      });

      return newMap;
    });

    // Actualizar contadores
    this.unreadCountMap.update((map) => {
      const newMap: UnreadCountMap = {};
      const messagesMap = this.unreadMessagesMap();

      Object.keys(map).forEach((chatId) => {
        const count = messagesMap[chatId]?.length || 0;
        if (count > 0) {
          newMap[chatId] = count;
        }
      });

      return newMap;
    });

    this.unreadCountSubject.next(this.unreadCountMap());
  }

  /**
   * Configuración de headers HTTP
   */
  private getHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });

    // El token se maneja automáticamente por las cookies con withCredentials
    const token = localStorage.getItem('access-token');
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    return headers;
  }

  /**
   * Opciones HTTP con credenciales
   */
  private getHttpOptions(): { headers: HttpHeaders; withCredentials: boolean } {
    return {
      headers: this.getHeaders(),
      withCredentials: true,
    };
  }

  // ===== NOTIFICACIONES DEL NAVEGADOR =====

  /**
   * Inicializar el sonido de notificación
   * Usamos la API Web Audio para generar un tono corto
   */
  private initializeNotificationSound(): void {
    // No crear AudioContext en inicialización — se crea de forma lazy en playNotificationSound()
    // para evitar crashes en entornos headless (Playwright/Chromium) y cumplir con la
    // política de autoplay del navegador que requiere un gesto del usuario.
    console.log(
      '[UnreadMessagesService] 🔔 Sonido de notificación configurado (lazy)'
    );
  }

  /**
   * Reproducir sonido de notificación
   */
  private playNotificationSound(): void {
    if (!this.soundEnabled) {
      console.log('[UnreadMessagesService] 🔇 Sonido deshabilitado');
      return;
    }

    try {
      // Check if AudioContext is available (not available in tests)
      if (
        typeof window === 'undefined' ||
        (!window.AudioContext && !(window as any).webkitAudioContext)
      ) {
        console.log(
          '[UnreadMessagesService] AudioContext no disponible en este entorno'
        );
        return;
      }

      // Crear un nuevo contexto de audio para cada notificación
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Tono de notificación (dos beeps cortos)
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      const now = audioContext.currentTime;

      // Primer beep
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01);
      gainNode.gain.linearRampToValueAtTime(0, now + 0.1);

      // Segundo beep
      gainNode.gain.setValueAtTime(0, now + 0.15);
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.16);
      gainNode.gain.linearRampToValueAtTime(0, now + 0.25);

      oscillator.start(now);
      oscillator.stop(now + 0.3);

      console.log(
        '[UnreadMessagesService] 🔊 Reproduciendo sonido de notificación'
      );
    } catch (error) {
      console.error(
        '[UnreadMessagesService] Error al reproducir sonido:',
        error
      );
    }
  }

  /**
   * Solicitar permiso para notificaciones del navegador
   */
  private requestNotificationPermission(): void {
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then((permission) => {
          this.notificationsEnabled = permission === 'granted';
          console.log(
            '[UnreadMessagesService] Permiso de notificaciones:',
            permission
          );
        });
      } else {
        this.notificationsEnabled = Notification.permission === 'granted';
        console.log(
          '[UnreadMessagesService] Estado de notificaciones:',
          this.notificationsEnabled ? 'habilitadas' : 'deshabilitadas'
        );
      }
    }
  }

  /**
   * Obtener el Router de forma lazy para evitar dependencias circulares
   */
  private getRouter(): Router | null {
    if (!this.router) {
      try {
        this.router = this.injector.get(Router);
      } catch (error) {
        console.warn(
          '[UnreadMessagesService] No se pudo obtener el Router:',
          error
        );
        return null;
      }
    }
    return this.router;
  }

  /**
   * Mostrar notificación del navegador
   * Solo muestra notificaciones cuando:
   * - La pestaña está en background (document.hidden === true)
   * - O la pestaña está visible pero el usuario está en otro chat
   */
  private showBrowserNotification(message: Message): void {
    console.log(
      '[UnreadMessagesService] 🔔 === INTENTANDO MOSTRAR NOTIFICACIÓN ==='
    );
    console.log('[UnreadMessagesService] 📋 Estado de permisos:', {
      notificationsEnabled: this.notificationsEnabled,
      notificationInWindow: 'Notification' in window,
      notificationPermission:
        'Notification' in window ? Notification.permission : 'N/A',
    });

    if (!this.notificationsEnabled || !('Notification' in window)) {
      console.log(
        '[UnreadMessagesService] ❌ Notificaciones del navegador deshabilitadas'
      );
      return;
    }

    if (Notification.permission !== 'granted') {
      console.log(
        '[UnreadMessagesService] ❌ Permiso de notificaciones NO concedido:',
        Notification.permission
      );
      return;
    }

    // Verificar si la pestaña está en background
    const isPageHidden =
      document.hidden || document.visibilityState === 'hidden';
    console.log('[UnreadMessagesService] 📋 Estado de visibilidad:', {
      hidden: document.hidden,
      visibilityState: document.visibilityState,
      isPageHidden,
    });

    // Reproducir sonido de notificación
    this.playNotificationSound();

    // Preparar título de la notificación con más contexto
    const title = isPageHidden
      ? '💬 Nuevo mensaje de visitante'
      : '💬 Mensaje en otro chat';

    // Preparar contenido con preview del mensaje
    const body =
      message.content.length > 100
        ? `${message.content.substring(0, 100)}...`
        : message.content;

    console.log(
      '[UnreadMessagesService] 🔔 Mostrando notificación del navegador:',
      {
        title,
        body,
        chatId: message.chatId,
        isPageHidden,
      }
    );

    try {
      const notification = new Notification(title, {
        body: body,
        icon: '/favicon.ico', // Icono de la notificación
        badge: '/favicon.ico',
        tag: `chat-${message.chatId}`, // Agrupa notificaciones del mismo chat
        requireInteraction: false, // No requiere interacción del usuario
        silent: true, // Ya reproducimos nuestro propio sonido
      });

      // Navegar al chat al hacer click
      notification.onclick = () => {
        window.focus();

        // Navegar a Atención con el chat seleccionado
        const router = this.getRouter();
        if (router) {
          console.log(
            '[UnreadMessagesService] 🚀 Navegando a atención con chat:',
            message.chatId
          );
          router
            .navigate(['/atencion'], {
              queryParams: { cola: 'mios', chat: message.chatId },
            })
            .then(() => {
              console.log('[UnreadMessagesService] ✅ Navegación completada');
            })
            .catch((error) => {
              console.error(
                '[UnreadMessagesService] ❌ Error en navegación:',
                error
              );
            });
        } else {
          console.warn(
            '[UnreadMessagesService] ⚠️ No se pudo navegar: Router no disponible'
          );
          window.location.href = `/atencion?cola=mios&chat=${message.chatId}`;
        }

        notification.close();
      };

      // Auto-cerrar después de 6 segundos
      setTimeout(() => {
        try {
          notification.close();
        } catch (e) {
          // Ignorar errores si la notificación ya fue cerrada
        }
      }, 6000);

      console.log(
        '[UnreadMessagesService] ✅ Notificación del navegador mostrada correctamente'
      );
    } catch (error) {
      console.error(
        '[UnreadMessagesService] Error al mostrar notificación del navegador:',
        error
      );
    }
  }

  /**
   * Habilitar/deshabilitar notificaciones del navegador
   */
  enableNotifications(enabled: boolean): void {
    this.notificationsEnabled =
      enabled && Notification.permission === 'granted';
    console.log(
      '[UnreadMessagesService] Notificaciones',
      enabled ? 'habilitadas' : 'deshabilitadas'
    );
  }

  /**
   * Verificar si las notificaciones están habilitadas
   */
  areNotificationsEnabled(): boolean {
    return this.notificationsEnabled;
  }

  /**
   * Habilitar/deshabilitar sonido de notificación
   */
  enableSound(enabled: boolean): void {
    this.soundEnabled = enabled;
    console.log(
      '[UnreadMessagesService] Sonido',
      enabled ? 'habilitado' : 'deshabilitado'
    );
  }

  /**
   * Verificar si el sonido está habilitado
   */
  isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  /**
   * Reproducir sonido de prueba
   */
  playTestSound(): void {
    console.log('[UnreadMessagesService] Reproduciendo sonido de prueba...');
    this.playNotificationSound();
  }

  /**
   * Mostrar notificación de prueba para verificar que funcionan
   */
  testNotification(): void {
    console.log('[UnreadMessagesService] 🧪 === PRUEBA DE NOTIFICACIÓN ===');
    console.log(
      '[UnreadMessagesService] 📋 Notification API disponible:',
      'Notification' in window
    );
    console.log(
      '[UnreadMessagesService] 📋 Permiso actual:',
      'Notification' in window ? Notification.permission : 'N/A'
    );
    console.log(
      '[UnreadMessagesService] 📋 notificationsEnabled:',
      this.notificationsEnabled
    );

    if (!('Notification' in window)) {
      console.error(
        '[UnreadMessagesService] ❌ Este navegador no soporta notificaciones'
      );
      return;
    }

    if (Notification.permission === 'denied') {
      console.error(
        '[UnreadMessagesService] ❌ Notificaciones bloqueadas por el usuario'
      );
      console.log(
        '[UnreadMessagesService] 💡 Ve a Configuración del navegador > Privacidad > Notificaciones y permite localhost:4200'
      );
      return;
    }

    if (Notification.permission === 'default') {
      console.log('[UnreadMessagesService] ⚠️ Solicitando permiso...');
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          this.showTestNotification();
        } else {
          console.error('[UnreadMessagesService] ❌ Permiso denegado');
        }
      });
      return;
    }

    this.showTestNotification();
  }

  private showTestNotification(): void {
    try {
      const notification = new Notification('🧪 Prueba de notificación', {
        body: 'Si ves esto, las notificaciones funcionan correctamente!',
        icon: '/favicon.ico',
        tag: 'test-notification',
      });

      console.log('[UnreadMessagesService] ✅ Notificación de prueba creada');

      notification.onclick = () => {
        console.log(
          '[UnreadMessagesService] 👆 Click en notificación de prueba'
        );
        notification.close();
      };

      setTimeout(() => notification.close(), 5000);
    } catch (error) {
      console.error(
        '[UnreadMessagesService] ❌ Error al crear notificación:',
        error
      );
    }
  }

  // ===== TÍTULO PARPADEANTE =====

  /**
   * Iniciar parpadeo del título de la pestaña
   * Alterna entre el título original y "💬 (X) Nuevo mensaje"
   */
  private startTitleFlashing(): void {
    // Si ya está parpadeando, actualizar solo el contador
    if (this.isTitleFlashing) {
      return;
    }

    // Guardar título original
    this.originalTitle = document.title;
    this.isTitleFlashing = true;

    console.log('[UnreadMessagesService] 🔔 Iniciando parpadeo del título');

    let showingAlert = false;

    this.titleFlashInterval = setInterval(() => {
      const totalUnread = this.totalUnreadCount();

      if (totalUnread === 0) {
        this.stopTitleFlashing();
        return;
      }

      if (showingAlert) {
        document.title = this.originalTitle;
      } else {
        document.title = `💬 (${totalUnread}) Nuevo mensaje`;
      }

      showingAlert = !showingAlert;
    }, 1000);
  }

  /**
   * Detener parpadeo del título y restaurar título original
   */
  private stopTitleFlashing(): void {
    if (!this.isTitleFlashing) {
      return;
    }

    console.log('[UnreadMessagesService] 🔕 Deteniendo parpadeo del título');

    if (this.titleFlashInterval) {
      clearInterval(this.titleFlashInterval);
      this.titleFlashInterval = null;
    }

    // Restaurar título original
    if (this.originalTitle) {
      document.title = this.originalTitle;
    }

    this.isTitleFlashing = false;
  }

  /**
   * Configurar reanudación del AudioContext después de gesto del usuario
   * Necesario para evitar el error de autoplay policy de Chrome
   */
  private setupAudioContextResume(): void {
    const resumeAudio = () => {
      if (this.audioResumed) return;

      try {
        // Intentar crear y reanudar el AudioContext
        if (!this.audioContext) {
          this.audioContext = new (window.AudioContext ||
            (window as any).webkitAudioContext)();
        }

        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume().then(() => {
            this.audioResumed = true;
            console.log(
              '[UnreadMessagesService] ✅ AudioContext reanudado después de gesto del usuario'
            );

            // Limpiar listeners después de reanudar
            document.removeEventListener('click', resumeAudio);
            document.removeEventListener('keydown', resumeAudio);
            document.removeEventListener('touchstart', resumeAudio);
          });
        } else {
          this.audioResumed = true;
        }
      } catch (error) {
        console.warn(
          '[UnreadMessagesService] Error al reanudar AudioContext:',
          error
        );
      }
    };

    // Escuchar primer gesto del usuario
    document.addEventListener('click', resumeAudio, { once: false });
    document.addEventListener('keydown', resumeAudio, { once: false });
    document.addEventListener('touchstart', resumeAudio, { once: false });

    console.log(
      '[UnreadMessagesService] 🎧 Listeners de gesto de usuario configurados para reanudar audio'
    );
  }

  // ===== CLEANUP =====

  /**
   * Limpiar estado
   */
  clear(): void {
    this.unreadCountMap.set({});
    this.unreadMessagesMap.set({});
    this.error.set(null);
    this.isLoading.set(false);
    this.stopTitleFlashing();
  }
}
