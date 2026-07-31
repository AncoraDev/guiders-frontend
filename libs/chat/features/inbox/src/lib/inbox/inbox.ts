import {
  Component,
  inject,
  signal,
  computed,
  effect,
  OnInit,
  OnDestroy,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChatService } from '@guiders-frontend/chat-service';
import {
  TourUiBridgeService,
} from '@guiders-frontend/tour-sandbox';
import {
  Chat,
  Message,
  PresenceStatus,
  Visitor,
  SaveContactDataRequest,
  LeadContactData,
} from '@guiders-frontend/shared/types';
import { SessionService } from '@guiders-frontend/auth/data-access/session';
import { UnreadMessagesService } from '@guiders-frontend/unread-messages-service';
import { PresenceService } from '@guiders-frontend/presence-service';
import {
  VisitorsDataService,
  VisitorActivity,
} from '@guiders-frontend/visitors-data-service';
import { LeadContactService } from '@guiders-frontend/lead-contact-service';
import { GuidersInboxSidebarComponent } from '@guiders-frontend/chat/ui/inbox-sidebar';
import { GuidersChatWelcomeStateComponent } from '@guiders-frontend/chat/ui/chat-welcome-state';
import { GuidersChatPlaceholderComponent } from '@guiders-frontend/chat/ui/chat-placeholder';
import { VisitorDetailPanel } from '@guiders-frontend/visitor-detail-panel';
import { getVisitorDisplayName } from '@guiders-frontend/visitor-display-name';
import { CommercialPresenceService } from '@guiders-frontend/commercial-presence';

/**
 * Inbox - Coordinador principal del chat
 *
 * Responsabilidades simplificadas:
 * - Coordinar comunicación entre componentes UI modulares
 * - Manejar estado global de conversaciones y selección
 * - Gestionar servicios de datos (ChatService, SessionService)
 * - Sincronizar datos entre sidebar, welcome state y placeholder
 *
 * Componentes UI utilizados:
 * - GuidersInboxSidebarComponent: Panel lateral completo
 * - GuidersChatWelcomeStateComponent: Estado sin chat seleccionado
 * - GuidersChatPlaceholderComponent: Placeholder para chat seleccionado
 */

@Component({
  selector: 'chat-inbox',
  standalone: true,
  imports: [
    CommonModule,
    GuidersInboxSidebarComponent,
    GuidersChatWelcomeStateComponent,
    GuidersChatPlaceholderComponent,
    VisitorDetailPanel,
  ],
  templateUrl: './inbox.html',
  styleUrl: './inbox.scss',
})
export class Inbox implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly chatService = inject(ChatService);
  private readonly sessionService = inject(SessionService);
  private readonly unreadMessagesService = inject(UnreadMessagesService);
  private readonly presenceService = inject(PresenceService);
  private readonly visitorsDataService = inject(VisitorsDataService);
  private readonly leadContactService = inject(LeadContactService);
  private readonly commercialPresence = inject(CommercialPresenceService);
  private readonly tourUiBridge = inject(TourUiBridgeService, { optional: true });

  // ===== ESTADO PRINCIPAL =====
  readonly selectedConversationId = signal<string | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly conversations = signal<Chat[]>([]);
  readonly messagesMap = signal<Record<string, Message[]>>({});

  // Estado de paginación de mensajes
  readonly messagePaginationMap = signal<
    Record<
      string,
      {
        total: number;
        hasMore: boolean;
        nextCursor?: string;
        isLoadingMore: boolean;
      }
    >
  >({});

  // Estado de presencia por chat
  readonly chatPresenceMap = signal<Record<string, PresenceStatus | undefined>>(
    {}
  );

  // Estado del panel de detalles del visitante
  readonly showVisitorPanel = signal<boolean>(false);

  /**
   * Sync the visitor detail panel open/close with the tour UI bridge so the
   * interactive tour can auto-open the panel during step 5
   * (visitor-detail-panel) without requiring the user to click. Only active
   * when the bridge is provided (i.e. tour-sandbox lib is loaded).
   */
  private readonly _tourPanelSync = this.tourUiBridge
    ? effect(() => {
        const requested = this.tourUiBridge!.visitorPanelOpenRequested();
        this.showVisitorPanel.set(requested);
      })
    : null;

  // URL actual del visitante seleccionado
  readonly visitorCurrentUrl = signal<string | null>(null);

  // Actividad del visitante seleccionado
  readonly visitorActivity = signal<VisitorActivity | null>(null);

  // Estado de guardado de datos de contacto
  readonly savingContactData = signal<boolean>(false);

  // Datos de contacto del visitante seleccionado
  readonly visitorContactData = signal<LeadContactData | null>(null);

  // ===== COMPUTED VALUES =====
  readonly currentUser = computed(() => this.sessionService.getCurrentUser());
  readonly currentUserId = computed(() => this.currentUser()?.sub || null);
  readonly currentMessages = computed(() => {
    const chatId = this.selectedConversationId();
    if (!chatId) {
      return [] as Message[];
    }
    return this.messagesMap()[chatId] ?? [];
  });

  readonly selectedChat = computed(() => {
    const chatId = this.selectedConversationId();
    if (!chatId) return null;
    return this.conversations().find((chat) => chat.chatId === chatId) || null;
  });

  readonly currentPagination = computed(() => {
    const chatId = this.selectedConversationId();
    if (!chatId) return { total: 0, hasMore: false, isLoadingMore: false };
    return (
      this.messagePaginationMap()[chatId] ?? {
        total: 0,
        hasMore: false,
        isLoadingMore: false,
      }
    );
  });

  readonly selectedVisitor = computed((): Visitor | null => {
    const chat = this.selectedChat();
    if (!chat?.participants?.length) return null;

    // Obtener el primer participante como visitante
    const participant = chat.participants[0];
    if (!participant) return null;

    // Mapear presencia a estado de visitante
    const presenceStatus = this.chatPresenceMap()[chat.chatId];
    let visitorStatus: 'online' | 'offline' | 'idle' = 'offline';
    if (presenceStatus === 'online' || presenceStatus === 'chatting') {
      visitorStatus = 'online';
    } else if (presenceStatus === 'away' || presenceStatus === 'busy') {
      visitorStatus = 'idle';
    }

    // Extraer dominio de la URL actual
    const currentUrl = this.visitorCurrentUrl();
    let domain = '';
    if (currentUrl) {
      try {
        const url = new URL(currentUrl);
        domain = url.hostname;
      } catch {
        domain = '';
      }
    }

    // Obtener datos de actividad del visitante
    const activity = this.visitorActivity();

    // Convertir el participante a Visitor con datos reales de activity
    // Usar función centralizada para obtener el nombre de visualización
    const displayName = getVisitorDisplayName({
      id: participant.id,
      name: participant.name,
      email: participant.email,
    });

    return {
      id: participant.id || '',
      siteId: 'site-001',
      companyId: 'company-001',
      name: displayName,
      email: participant.email || 'visitante@ejemplo.com',
      phone: '+34 612 345 678',
      domain: domain,
      currentUrl: currentUrl || undefined,
      status: visitorStatus,
      lifecycle: activity?.lifecycle || 'ENGAGED',
      firstVisit: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Hace 7 días
      lastVisit: activity?.lastActivityAt
        ? new Date(activity.lastActivityAt)
        : chat.updatedAt || chat.createdAt,
      totalChats: activity?.totalChats ?? 0,
      totalSessions: activity?.totalSessions ?? 0,
      totalPageViews: activity?.totalPagesVisited ?? 0,
      averageSessionDuration: activity
        ? Math.floor(activity.totalTimeConnectedMs / 1000)
        : 0,
      isNewVisitor: false,
      hasActiveChat: true,
    };
  });

  // ===== LIFECYCLE =====
  ngOnInit() {
    // Configurar UnreadMessagesService con el usuario actual
    const userId = this.currentUserId();
    if (userId) {
      this.unreadMessagesService.setCurrentUser(userId);
    }

    this.initializeDataSubscriptions();
    this.loadInitialData();
    this.initializeUnreadMessagesSync();
    this.initializePageChangeListener();
  }

  ngOnDestroy() {
    console.log('[Inbox] 🔴 === COMPONENTE DESTRUIDO - LIMPIANDO ESTADO ===');

    // Limpiar el chat activo en UnreadMessagesService
    // Esto es CRÍTICO: permite que las notificaciones funcionen cuando el usuario cambia de ruta
    this.unreadMessagesService.setActiveChat(null);

    // Limpiar estado local (opcional, pero recomendado para claridad)
    this.selectedConversationId.set(null);
    this.chatService.selectChat(null);

    console.log('[Inbox] ✅ Estado de chat activo limpiado correctamente');
  }

  // ===== INICIALIZACIÓN =====
  private initializeDataSubscriptions(): void {
    // Sincronizar chats del servicio con la señal local
    this.chatService.chats$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((chats: Chat[]) => {
        this.conversations.set(chats);
      });

    // Sincronizar estado de carga
    this.chatService.loading$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((loading: boolean) => {
        this.isLoading.set(loading);
      });

    // Sincronizar errores
    this.chatService.error$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((errorMessage: string | null) => {
        this.error.set(errorMessage);
      });

    // Sincronizar chat seleccionado del servicio
    this.chatService.selectedChat$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((chatId: string | null) => {
        this.selectedConversationId.set(chatId);
      });

    // Sincronizar mensajes que llegan por WebSocket o se envían
    this.chatService.messages$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((messagesMap) => {
        // Obtener todos los chats que tienen mensajes en el servicio
        Object.keys(messagesMap).forEach((chatId) => {
          const serviceMessages = messagesMap[chatId];
          const currentMessages = this.messagesMap()[chatId] || [];

          // Solo actualizar si hay mensajes nuevos que no estén en la lista local
          const newMessages = serviceMessages.filter(
            (serviceMsg) =>
              !currentMessages.some(
                (localMsg) => localMsg.messageId === serviceMsg.messageId
              )
          );

          if (newMessages.length > 0) {
            console.log(
              `[Inbox] Sincronizando ${newMessages.length} mensajes nuevos para chat ${chatId}`
            );
            this.messagesMap.update((map) => ({
              ...map,
              [chatId]: [...currentMessages, ...newMessages],
            }));
          }
        });
      });
  }

  private loadInitialData(): void {
    const userId = this.currentUserId();
    if (!userId) {
      console.error('No se pudo obtener el ID del usuario');
      return;
    }

    this.loadChats();
  }

  /**
   * Cargar datos de contacto del visitante
   */
  private loadVisitorContactData(visitorId: string): void {
    this.leadContactService
      .getContactData(visitorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (contactData) => {
          console.log('[Inbox] Datos de contacto del visitante:', contactData);
          this.visitorContactData.set(contactData);
        },
        error: (err) => {
          console.error('[Inbox] Error al cargar datos de contacto:', err);
          this.visitorContactData.set(null);
        },
      });
  }

  private loadChats(): void {
    const commercialId = this.currentUserId();
    if (!commercialId) return;

    this.chatService
      .getCommercialChats(commercialId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (chats) => {
          console.log('Chats cargados:', chats.length);

          // Self chats are client-side only: exclude them from any backend
          // round-trip (presence, unread counters, WS room joins, visitor registry).
          const remoteChats = chats.filter(
            (chat) => !this.chatService.isSelfChatId(chat.chatId)
          );

          // Extraer IDs de todos los chats remotos
          const chatIds = remoteChats.map((chat) => chat.chatId);

          // ✅ Registrar relaciones chat-visitor para badges en la tabla de visitantes
          const chatsToRegister = remoteChats.map((chat) => ({
            chatId: chat.chatId,
            visitorId: chat.visitorId,
          }));
          this.unreadMessagesService.registerChatsVisitors(chatsToRegister);
          console.log(
            `✅ [Inbox] Registradas ${chatsToRegister.length} relaciones chat-visitor`
          );

          // ✅ IMPORTANTE: Suscribirse a TODOS los chats vía WebSocket
          // Esto permite recibir notificaciones en tiempo real de mensajes nuevos
          // en cualquier chat, no solo el chat seleccionado
          if (this.chatService.isWebSocketConnected && chatIds.length > 0) {
            this.chatService.webSocketService.joinMultipleRooms(chatIds);
            console.log(
              `✅ [Inbox] Suscrito a ${chatIds.length} chats para notificaciones en tiempo real`
            );
          }

          // Refrescar contadores de mensajes no leídos para todos los chats
          this.unreadMessagesService.refreshUnreadCounts(chatIds);

          // Cargar estado de presencia para cada chat (loadChatPresence ya filtra self internamente)
          remoteChats.forEach((chat) => {
            this.loadChatPresence(chat.chatId);
          });
        },
        error: (error) => {
          console.error('Error al cargar chats:', error);
          this.error.set('Error al cargar las conversaciones');
        },
      });
  }

  // ===== EVENT HANDLERS - COORDINACIÓN ENTRE COMPONENTES =====

  /**
   * Manejar selección de conversación desde el sidebar
   */
  onUserSelected(conversation: Chat): void {
    console.log('[Inbox] 🔄 === CONVERSACIÓN SELECCIONADA ===');
    console.log('[Inbox] 📋 ChatId:', conversation.chatId);
    console.log(
      '[Inbox] 📋 Visitor Name:',
      conversation.participants?.[0]?.name
    );
    console.log('[Inbox] 📊 Unread Count (antes):', conversation.unreadCount);

    this.selectedConversationId.set(conversation.chatId);
    this.chatService.selectChat(conversation.chatId);

    // ✅ NOTIFICAR AL SERVICIO QUE ESTE ES EL CHAT ACTIVO
    // Esto previene que se incrementen contadores y se muestren notificaciones
    // para mensajes de este chat, y marca automáticamente como leídos
    console.log('[Inbox] 🚀 Llamando a unreadMessagesService.setActiveChat...');
    this.unreadMessagesService.setActiveChat(conversation.chatId);

    // Cargar mensajes para la conversación seleccionada
    console.log('[Inbox] 📥 Cargando mensajes del chat...');
    this.loadMessages(conversation.chatId);

    // Cargar datos del visitante (URL actual y contactData)
    const visitorId = conversation.participants?.[0]?.id;
    if (visitorId) {
      this.loadVisitorCurrentPage(visitorId);
      this.loadVisitorContactData(visitorId);
    }
  }

  /**
   * Manejar creación de nueva conversación
   */
  onNewChatClick(): void {
    console.log('Crear nueva conversación');
    // TODO: Implementar modal de creación de chat
    // this.openNewChatModal();
  }

  /**
   * Manejar configuración del chat desde placeholder
   */
  onChatSettings(): void {
    const chatId = this.selectedConversationId();
    console.log('Configuración del chat:', chatId);
    // TODO: Implementar modal de configuración
    // this.openChatSettingsModal(chatId);
  }

  /**
   * Manejar cierre del chat desde placeholder
   */
  onCloseChat(): void {
    console.log('[Inbox] 🔄 === CERRANDO CHAT ===');
    console.log('[Inbox] 📋 Chat actual:', this.selectedConversationId());

    this.selectedConversationId.set(null);
    this.chatService.selectChat(null);
    this.showVisitorPanel.set(false);

    // Limpiar datos del visitante
    this.visitorContactData.set(null);
    this.visitorActivity.set(null);
    this.visitorCurrentUrl.set(null);

    // ✅ NOTIFICAR AL SERVICIO QUE NO HAY CHAT ACTIVO
    console.log(
      '[Inbox] 🚀 Llamando a unreadMessagesService.setActiveChat(null)...'
    );
    this.unreadMessagesService.setActiveChat(null);
    console.log('[Inbox] ✅ Chat cerrado correctamente');
  }

  /**
   * Toggle del panel de detalles del visitante
   */
  toggleVisitorPanel(): void {
    this.showVisitorPanel.update((value) => !value);
  }

  /**
   * Cerrar panel de detalles del visitante
   */
  onCloseVisitorPanel(): void {
    this.showVisitorPanel.set(false);
  }

  /**
   * Manejar guardado de datos de contacto
   * NOTA: El visitorId va en la URL del endpoint POST, no en el body
   * NOTA: La API no devuelve los datos guardados, por lo que construimos el objeto localmente
   */
  onSaveContactData(request: SaveContactDataRequest): void {
    const visitorId = this.selectedVisitor()?.id;
    if (!visitorId) {
      console.error('No hay ID de visitante disponible');
      return;
    }

    this.savingContactData.set(true);
    // visitorId se pasa separado para construir la URL del endpoint
    this.leadContactService
      .saveContactData(visitorId, request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          console.log('[Inbox] Datos de contacto guardados exitosamente');
          this.savingContactData.set(false);

          // Como la API no devuelve los datos, construimos el objeto LeadContactData
          // a partir del request enviado
          const now = new Date().toISOString();
          const updatedContactData: LeadContactData = {
            id: this.visitorContactData()?.id || `temp-${Date.now()}`,
            visitorId: visitorId,
            companyId: this.visitorContactData()?.companyId || 'unknown',
            alias: request.alias,
            nombre: request.nombre,
            apellidos: request.apellidos,
            email: request.email,
            telefono: request.telefono,
            dni: request.dni,
            poblacion: request.poblacion,
            extractedFromChatId: request.extractedFromChatId,
            additionalData: request.additionalData,
            extractedAt: this.visitorContactData()?.extractedAt || now,
            updatedAt: now,
          };

          // Actualizar el signal con los datos construidos
          this.visitorContactData.set(updatedContactData);

          console.log(
            '[Inbox] Datos de contacto actualizados localmente:',
            updatedContactData
          );

          // TODO: Mostrar notificación de éxito
        },
        error: (error) => {
          console.error('[Inbox] Error al guardar datos de contacto:', error);
          this.savingContactData.set(false);
          // TODO: Mostrar notificación de error
        },
      });
  }

  /**
   * Manejar envío de mensaje
   */
  onSendMessage(content: string): void {
    const chatId = this.selectedConversationId();

    if (!chatId) {
      console.error('No se puede enviar el mensaje: falta chatId');
      return;
    }

    if (!this.commercialPresence.getCurrentStatus().isConnected) {
      this.error.set('Conéctate para poder enviar mensajes');
      return;
    }

    this.chatService
      .sendMessage({
        chatId,
        content,
        type: 'text',
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (message) => {
          console.log('Mensaje enviado:', message);
          // El mensaje se sincronizará automáticamente vía la suscripción a messages$
          // No es necesario actualizar messagesMap manualmente aquí
        },
        error: (error) => {
          console.error('Error al enviar mensaje:', error);
          this.error.set('Error al enviar el mensaje');
        },
      });
  }

  // ===== MÉTODOS AUXILIARES =====

  private loadMessages(chatId: string): void {
    // Self chats are persisted in localStorage and bridged through
    // ChatService.messages$ — they must skip the HTTP fetch, otherwise
    // the 404 error path would clear the editor gate (messages.length > 0).
    if (this.chatService.isSelfChatId(chatId)) {
      return;
    }
    this.chatService
      .getMessagesV2(chatId, {
        limit: 50,
        // El endpoint por defecto devuelve sentAt DESC (más recientes primero)
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          console.log(
            `Mensajes cargados para ${chatId}:`,
            response.messages.length
          );

          // Los mensajes vienen en orden descendente (más recientes primero)
          // Los revertimos para mostrarlos ascendente (más antiguos arriba)
          const messages = [...response.messages].reverse();

          // Actualizar mensajes
          this.messagesMap.update((map) => ({
            ...map,
            [chatId]: messages,
          }));

          // Actualizar información de paginación
          this.messagePaginationMap.update((map) => ({
            ...map,
            [chatId]: {
              total: response.total,
              hasMore: response.hasMore,
              nextCursor: response.nextCursor,
              isLoadingMore: false,
            },
          }));
        },
        error: (error) => {
          console.error('Error al cargar mensajes:', error);
          this.error.set('Error al cargar los mensajes');
        },
      });
  }

  /**
   * Cargar más mensajes antiguos (scroll infinito)
   */
  onLoadMoreMessages(): void {
    const chatId = this.selectedConversationId();
    if (!chatId) return;

    const pagination = this.messagePaginationMap()[chatId];
    if (!pagination?.hasMore || pagination.isLoadingMore) {
      console.log('No hay más mensajes para cargar o ya está cargando');
      return;
    }

    console.log(
      `Cargando más mensajes para ${chatId} con cursor:`,
      pagination.nextCursor
    );

    // Marcar como cargando
    this.messagePaginationMap.update((map) => ({
      ...map,
      [chatId]: {
        ...map[chatId],
        isLoadingMore: true,
      },
    }));

    this.chatService
      .getMessagesV2(chatId, {
        cursor: pagination.nextCursor,
        limit: 50,
        // El endpoint por defecto devuelve sentAt DESC
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          console.log(
            `Mensajes antiguos cargados: ${response.messages.length}`
          );

          // Los mensajes vienen en orden descendente
          // Los revertimos y los agregamos AL INICIO del array existente
          const newMessages = [...response.messages].reverse();
          const currentMessages = this.messagesMap()[chatId] || [];

          this.messagesMap.update((map) => ({
            ...map,
            [chatId]: [...newMessages, ...currentMessages],
          }));

          // Actualizar paginación
          this.messagePaginationMap.update((map) => ({
            ...map,
            [chatId]: {
              total: response.total,
              hasMore: response.hasMore,
              nextCursor: response.nextCursor,
              isLoadingMore: false,
            },
          }));
        },
        error: (error) => {
          console.error('Error al cargar más mensajes:', error);

          // Desmarcar loading en caso de error
          this.messagePaginationMap.update((map) => ({
            ...map,
            [chatId]: {
              ...map[chatId],
              isLoadingMore: false,
            },
          }));
        },
      });
  }

  /**
   * Refrescar datos del inbox
   */
  refresh(): void {
    this.loadChats();
    const chatId = this.selectedConversationId();
    if (chatId) {
      this.loadMessages(chatId);
    }
  }

  /**
   * Limpiar error
   */
  clearError(): void {
    this.error.set(null);
  }

  /**
   * Inicializar sincronización de mensajes no leídos
   */
  private initializeUnreadMessagesSync(): void {
    console.log(
      '[Inbox] 🎧 Inicializando sincronización de mensajes no leídos'
    );

    // Sincronizar contadores de no leídos con los chats
    this.unreadMessagesService.unreadCount$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((unreadCountMap) => {
        console.log('[Inbox] 📊 === SINCRONIZANDO CONTADORES DE NO LEÍDOS ===');
        console.log('[Inbox] 📋 Mapa de contadores recibido:', unreadCountMap);

        // Actualizar unreadCount en los chats locales
        this.conversations.update((chats) => {
          console.log('[Inbox] 📋 Total de chats a actualizar:', chats.length);

          const updatedChats = chats.map((chat) => {
            const newCount = unreadCountMap[chat.chatId] || 0;
            const oldCount = chat.unreadCount || 0;

            if (newCount !== oldCount) {
              console.log(
                `[Inbox] 🔄 Chat ${chat.chatId}: ${oldCount} -> ${newCount}`
              );
            }

            return {
              ...chat,
              unreadCount: newCount,
            };
          });

          console.log('[Inbox] ✅ Chats actualizados con nuevos contadores');
          return updatedChats;
        });
      });

    // Reconectar a todos los chats si el WebSocket se reconecta
    this.chatService.webSocketService.connectionState$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state === 'connected') {
          const chatIds = this.conversations()
            .filter((chat) => !this.chatService.isSelfChatId(chat.chatId))
            .map((chat) => chat.chatId);
          if (chatIds.length > 0) {
            console.log(
              '[Inbox] WebSocket reconectado, resubscribiendo a chats...'
            );
            this.chatService.webSocketService.joinMultipleRooms(chatIds);
            // Refrescar contadores después de reconectar
            this.unreadMessagesService.refreshUnreadCounts(chatIds);
            // Refrescar presencia después de reconectar
            chatIds.forEach((chatId) => this.loadChatPresence(chatId));
          }
        }
      });

    // Suscribirse a cambios de presencia vía WebSocket
    this.presenceService.presenceChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        console.log('[Inbox] Cambio de presencia detectado:', event);
        // Recargar presencia para todos los chats del usuario afectado
        this.conversations().forEach((chat) => {
          const isParticipant = chat.participants?.some(
            (p) => p.id === event.userId
          );
          if (isParticipant) {
            this.loadChatPresence(chat.chatId);
          }
        });
      });
  }

  /**
   * Cargar estado de presencia para un chat específico
   */
  private loadChatPresence(chatId: string): void {
    // Self chats live entirely client-side; no presence endpoint exists.
    if (this.chatService.isSelfChatId(chatId)) {
      return;
    }
    this.presenceService
      .getChatPresence(chatId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (chatPresence) => {
          // Obtener el estado del otro participante (no el usuario actual)
          const currentUserId = this.currentUserId();
          const otherParticipant = chatPresence.participants.find(
            (p) => p.userId !== currentUserId
          );

          this.chatPresenceMap.update((map) => ({
            ...map,
            [chatId]: otherParticipant?.connectionStatus,
          }));
        },
        error: (error) => {
          console.error(
            `[Inbox] Error al cargar presencia para chat ${chatId}:`,
            error
          );
        },
      });
  }

  /**
   * Obtener estado de presencia para un chat específico
   */
  getParticipantPresence(chatId: string): PresenceStatus | undefined {
    return this.chatPresenceMap()[chatId];
  }

  /**
   * Cargar la actividad del visitante (datos iniciales del panel de detalles)
   */
  private loadVisitorCurrentPage(visitorId: string): void {
    this.visitorsDataService
      .getVisitorActivity(visitorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (activity) => {
          console.log('[Inbox] Actividad del visitante:', activity);
          this.visitorActivity.set(activity);
          this.visitorCurrentUrl.set(activity.currentUrl);
        },
        error: (error) => {
          console.error(
            '[Inbox] Error al cargar actividad del visitante:',
            error
          );
          this.visitorActivity.set(null);
          this.visitorCurrentUrl.set(null);
        },
      });
  }

  /**
   * Inicializar listener para cambios de página del visitante
   */
  private initializePageChangeListener(): void {
    // Escuchar evento WebSocket de cambio de página
    this.chatService.webSocketService.on(
      'visitor:page-changed',
      (...args: unknown[]) => {
        const event = args[0] as {
          visitorId: string;
          chatId: string;
          previousPage: string | null;
          currentPage: string;
          timestamp: string;
        };

        console.log('[Inbox] Cambio de página detectado:', event);

        // Verificar si el cambio es para el chat seleccionado
        const selectedChatId = this.selectedConversationId();
        if (selectedChatId === event.chatId) {
          console.log(
            '[Inbox] Actualizando URL del visitante:',
            event.currentPage
          );
          this.visitorCurrentUrl.set(event.currentPage);
        }
      }
    );
  }
}
