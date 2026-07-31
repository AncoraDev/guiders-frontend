import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
  ChangeDetectorRef,
  ViewChild,
  ElementRef,
  AfterViewChecked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import {
  ChatWidgetService,
  WidgetState,
} from '@guiders-frontend/chat/data-access/chat-widget-service';
import { ChatService } from '@guiders-frontend/chat-service';
import { MessageInput } from '@guiders-frontend/chat/ui/message-input';
import {
  Message,
  SendMessageRequest,
  Visitor,
  PresenceStatus,
  MessageListResponse,
  ChatTab,
} from '@guiders-frontend/shared/types';
import { UserService } from '@guiders-frontend/auth/data-access/session';
import { TypingIndicator } from '@guiders-frontend/typing-indicator';
import { PresenceService } from '@guiders-frontend/presence-service';
import { ChatWidgetTabs } from '@guiders-frontend/chat-widget-tabs';
import { UnreadMessagesService } from '@guiders-frontend/unread-messages-service';
import { VisitorsDataService } from '@guiders-frontend/visitors-data-service';
import { Avatar } from '@guiders-frontend/avatar';
import { CommercialPresenceService } from '@guiders-frontend/commercial-presence';

@Component({
  selector: 'guiders-chat-widget',
  standalone: true,
  imports: [
    CommonModule,
    MessageInput,
    TypingIndicator,
    ChatWidgetTabs,
    Avatar,
  ],
  templateUrl: './chat-widget.html',
  styleUrls: ['./chat-widget.scss'],
})
export class ChatWidgetComponent
  implements OnInit, OnDestroy, AfterViewChecked
{
  private readonly widgetService = inject(ChatWidgetService);
  private readonly chatService = inject(ChatService);
  private readonly userService = inject(UserService);
  private readonly presenceService = inject(PresenceService);
  private readonly unreadMessagesService = inject(UnreadMessagesService);
  private readonly visitorsService = inject(VisitorsDataService);
  private readonly commercialPresence = inject(CommercialPresenceService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  @ViewChild('messagesContainer')
  messagesContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('scrollAnchor') scrollAnchor?: ElementRef<HTMLDivElement>;

  // Estado del widget
  readonly widgetState = signal<WidgetState>('closed');
  readonly currentVisitor = signal<Visitor | null>(null);
  readonly currentChatId = signal<string | null>(null);
  readonly currentUserId = signal<string | null>(null); // Se obtiene dinámicamente cuando se necesita
  readonly messages = signal<Message[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly shouldShow = signal<boolean>(true);
  /** Indica si el chat actual es pendiente (sin asignar a comercial) */
  readonly isPendingChat = signal<boolean>(false);

  // Estado de pestañas
  readonly tabs = signal<ChatTab[]>([]);
  readonly hasTabs = computed(() => this.tabs().length > 1);

  // Pestañas con contadores de no leídos sincronizados desde el servicio central
  readonly tabsWithUnread = computed(() => {
    const currentTabs = this.tabs();
    const unreadMap = this.unreadMessagesService.unreadCountMap();

    return currentTabs.map((tab) => ({
      ...tab,
      unreadCount: unreadMap[tab.chatId] ?? tab.unreadCount,
    }));
  });

  // Caché de mensajes por chatId para cambio rápido de pestañas
  private messagesCache = new Map<string, Message[]>();

  // Control de scroll infinito
  readonly isLoadingMore = signal<boolean>(false);
  readonly hasMoreMessages = signal<boolean>(false);
  private nextCursor: string | undefined = undefined;
  private intersectionObserver?: IntersectionObserver;
  private isHandlingIntersection = false;

  // Control de auto-scroll
  private shouldScrollToBottom = false;
  private isNearBottom = true;
  private previousScrollHeight = 0;

  // Control para evitar carga duplicada al crear chat
  private isCreatingChat = false;

  // Computed
  readonly isOpen = computed(() => this.widgetState() === 'open');
  readonly isMinimized = computed(() => this.widgetState() === 'minimized');
  readonly isClosed = computed(() => this.widgetState() === 'closed');
  readonly isVisible = computed(() => !this.isClosed() && this.shouldShow());

  readonly visitorName = computed(() => {
    const visitor = this.currentVisitor();
    return visitor?.name || visitor?.email || 'Visitante anónimo';
  });

  // Computed properties for Avatar component
  readonly visitorId = computed(() => {
    const visitor = this.currentVisitor();
    return visitor?.id || 'anonymous';
  });

  readonly visitorEmail = computed(() => {
    const visitor = this.currentVisitor();
    return visitor?.email;
  });

  // Typing indicator
  readonly typingUsers = signal<string[]>([]);
  readonly isVisitorTyping = computed(() => {
    const visitor = this.currentVisitor();
    const typing = this.typingUsers();
    return visitor && typing.length > 0 && typing.includes(visitor.id);
  });

  // Visitor presence
  readonly visitorPresenceStatus = signal<PresenceStatus | undefined>(
    undefined
  );
  readonly visitorPresenceBadge = computed(() => {
    const status = this.visitorPresenceStatus();
    if (!status) {
      return { label: 'Desconectado', color: 'neutral' };
    }

    const statusMap: Record<PresenceStatus, { label: string; color: string }> =
      {
        online: { label: 'En línea', color: 'success' },
        away: { label: 'Ausente', color: 'warning' },
        busy: { label: 'Ocupado', color: 'danger' },
        chatting: { label: 'En chat', color: 'success' },
        offline: { label: 'Desconectado', color: 'neutral' },
      };

    return statusMap[status] || { label: 'Desconectado', color: 'neutral' };
  });

  ngOnInit(): void {
    // Suscribirse al estado del widget
    this.widgetService.widgetData$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        console.log('[ChatWidget] Estado actualizado:', data);

        const previousChatId = this.currentChatId();
        const isNewChat = data.chatId && data.chatId !== previousChatId;
        const isNewVisitor =
          data.visitor &&
          (!this.currentVisitor() ||
            data.visitor.id !== this.currentVisitor()?.id);

        // 🔄 Si hay un cambio de chat o visitante, limpiar estado anterior
        if ((isNewChat || isNewVisitor) && previousChatId) {
          console.log(
            '[ChatWidget] 🧹 Limpiando estado anterior - Chat anterior:',
            previousChatId,
            'Nuevo chat:',
            data.chatId
          );

          // Salir de la sala WebSocket anterior
          this.chatService.webSocketService.leaveRoom(previousChatId);

          // Limpiar mensajes, errores y presencia
          this.messages.set([]);
          this.error.set(null);
          this.visitorPresenceStatus.set(undefined);
        }

        this.widgetState.set(data.state);
        this.currentVisitor.set(data.visitor);
        this.currentChatId.set(data.chatId);
        this.tabs.set(data.tabs || []);
        this.isPendingChat.set(data.isPending || false);

        if (data.isPending) {
          console.log(
            '[ChatWidget] 🟠 Chat pendiente abierto - se asignará al enviar primer mensaje'
          );
        }

        // ⚠️ Si estamos creando un chat, NO cargar mensajes aquí
        // La carga ya se está manejando en createChatWithFirstMessage()
        if (this.isCreatingChat) {
          console.log(
            '[ChatWidget] ⏭️ Saltando carga de mensajes - chat en creación'
          );
          return;
        }

        // Si se abre el widget con un chatId, cargar mensajes
        if (data.state === 'open' && data.chatId) {
          this.loadMessages(data.chatId);
        }

        // Si se abre el widget sin chatId, solo mostrar el widget vacío
        // El chat se creará cuando el usuario envíe el primer mensaje
        if (data.state === 'open' && !data.chatId && data.visitor) {
          console.log(
            '[ChatWidget] Widget abierto sin chat - esperando primer mensaje del usuario'
          );
          this.messages.set([]);
          this.error.set(null);
          this.loading.set(false);
        }

        this.cdr.detectChanges();
      });

    // Suscribirse a la visibilidad según la ruta
    this.widgetService.shouldShow$
      .pipe(takeUntil(this.destroy$))
      .subscribe((shouldShow) => {
        this.shouldShow.set(shouldShow);
        this.cdr.detectChanges();
      });

    // Suscribirse a mensajes del WebSocket
    this.chatService.webSocketService.messageReceived$
      .pipe(takeUntil(this.destroy$))
      .subscribe((message) => {
        if (message && message.chatId === this.currentChatId()) {
          console.log(
            '[ChatWidget] Nuevo mensaje recibido via WebSocket:',
            message
          );

          // ✨ FILTRAR MENSAJES PROPIOS - Ya fueron agregados por la respuesta HTTP
          const currentUserId = this.userService.getUserId();
          if (currentUserId && message.senderId === currentUserId) {
            console.log(
              '[ChatWidget] ⏭️ Mensaje propio ignorado (ya agregado por HTTP):',
              message.messageId
            );
            return;
          }

          console.log(
            '[ChatWidget] ✅ Mensaje de otro usuario, agregando:',
            message.messageId
          );
          this.addMessageToList(message);
          this.shouldScrollToBottom = true;
          this.cdr.detectChanges();
        }
      });

    // Suscribirse a eventos de typing
    this.presenceService.typingStart$
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        if (event.chatId === this.currentChatId()) {
          const typing = this.presenceService.getTypingUsers(event.chatId);
          this.typingUsers.set(typing);
          this.cdr.detectChanges();
        }
      });

    this.presenceService.typingStop$
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        if (event.chatId === this.currentChatId()) {
          const typing = this.presenceService.getTypingUsers(event.chatId);
          this.typingUsers.set(typing);
          this.cdr.detectChanges();
        }
      });

    // Suscribirse a cambios de presencia
    console.log('[ChatWidget] 🎧 Suscribiéndose a cambios de presencia...');
    this.presenceService.presenceChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        console.log('[ChatWidget] 📡 Cambio de presencia detectado:', event);
        const visitor = this.currentVisitor();
        const chatId = this.currentChatId();

        console.log('[ChatWidget] 📋 Estado actual:', {
          visitorId: visitor?.id,
          chatId: chatId,
          eventUserId: event.userId,
          eventStatus: event.status,
          matches: visitor && event.userId === visitor.id,
        });

        // Solo actualizar si es el visitante del chat actual
        if (visitor && chatId && event.userId === visitor.id) {
          console.log(
            '[ChatWidget] ✅ Actualizando presencia del visitante:',
            event.status
          );
          this.visitorPresenceStatus.set(event.status);
          this.cdr.detectChanges();
        } else {
          console.log(
            '[ChatWidget] ⏭️ Evento ignorado - No coincide con el visitante actual'
          );
        }
      });
    console.log(
      '[ChatWidget] ✅ Suscripción a cambios de presencia configurada'
    );
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom && this.messagesContainer) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy(): void {
    this.cleanupIntersectionObserver();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Crear un nuevo chat con el primer mensaje del usuario
   */
  private createChatWithFirstMessage(
    visitor: Visitor,
    firstMessageContent: string
  ): void {
    console.log(
      '[ChatWidget] 🆕 Creando nuevo chat con primer mensaje para:',
      visitor.name || visitor.id
    );

    // Limpiar estado anterior
    this.messages.set([]);
    this.error.set(null);
    this.loading.set(true);

    // 🚩 Activar bandera para evitar carga duplicada
    this.isCreatingChat = true;

    // Construir location si hay city y/o country
    const location =
      [visitor.city, visitor.country].filter(Boolean).join(', ') || undefined;

    this.chatService
      .createChatWithMessage({
        firstMessage: {
          content: firstMessageContent,
          type: 'text',
        },
        visitorInfo: {
          visitorId: visitor.id, // REQUERIDO para comerciales
          name: visitor.name,
          email: visitor.email,
          phone: visitor.phone,
          location: location,
        },
        metadata: {
          department: 'sales',
          priority: 'NORMAL',
          source: visitor.source || 'website',
          initialUrl: visitor.currentUrl,
        },
      })
      .subscribe({
        next: (result) => {
          if (result && result.chatId && result.messageId) {
            console.log(
              '[ChatWidget] ✅ Chat creado exitosamente:',
              result.chatId
            );

            // ✅ MARCAR CHAT COMO ACTIVO desde el inicio
            this.unreadMessagesService.setActiveChat(result.chatId);
            console.log(
              '[ChatWidget] 👁️ Nuevo chat marcado como activo:',
              result.chatId
            );

            this.currentChatId.set(result.chatId);

            // Obtener userId del UserService
            const userId = this.userService.getUserId();

            if (!userId) {
              console.error(
                '[ChatWidget] ❌ No se puede crear mensaje sin userId'
              );
              this.error.set(
                'Error de autenticación. Por favor, recarga la página.'
              );
              this.loading.set(false);
              this.isCreatingChat = false;
              return;
            }

            // Crear mensaje optimista
            const optimisticMessage: Message = {
              messageId: result.messageId,
              chatId: result.chatId,
              senderId: userId,
              senderType: 'COMMERCIAL',
              content: firstMessageContent,
              type: 'TEXT',
              sentAt: new Date(),
              status: 'SENT',
            };

            this.messages.set([optimisticMessage]);
            this.shouldScrollToBottom = true;

            // Unirse a la sala de WebSocket
            this.chatService.webSocketService.joinRoom(result.chatId);

            // Cargar presencia inicial del chat
            this.loadChatPresence(result.chatId);

            // ✅ Actualizar chatId en el servicio y desactivar la bandera
            setTimeout(() => {
              this.widgetService.updateChatId(result.chatId);
              this.isCreatingChat = false;
              console.log('[ChatWidget] ✅ Bandera de creación desactivada');
            }, 100);
          }
          this.loading.set(false);
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('[ChatWidget] Error al crear chat:', err);
          this.error.set(
            'No se pudo crear el chat. Por favor, intenta nuevamente.'
          );
          this.loading.set(false);
          this.isCreatingChat = false; // Desactivar bandera en caso de error
          this.cdr.detectChanges();
        },
      });
  }

  /**
   * Cargar mensajes de un chat existente
   */
  private loadMessages(chatId: string): void {
    console.log('[ChatWidget] 📥 Cargando mensajes para chat:', chatId);

    // ✅ MARCAR CHAT COMO ACTIVO - Esto resetea contadores y marca mensajes como leídos
    this.unreadMessagesService.setActiveChat(chatId);
    console.log(
      '[ChatWidget] 👁️ Chat marcado como activo para resetear contadores:',
      chatId
    );

    // Limpiar mensajes anteriores antes de cargar los nuevos
    this.messages.set([]);
    this.error.set(null);
    this.loading.set(true);
    this.nextCursor = undefined;
    this.hasMoreMessages.set(false);

    this.chatService
      .getMessagesV2(chatId, {
        limit: 50,
        // El endpoint por defecto devuelve sentAt DESC (más recientes primero)
      })
      .subscribe({
        next: (response) => {
          console.log(
            '[ChatWidget] Mensajes cargados:',
            response.messages.length
          );

          // Los mensajes vienen en orden descendente (más recientes primero)
          // Los revertimos para mostrarlos ascendente (más antiguos arriba)
          const messages = [...response.messages].reverse();
          this.messages.set(messages);

          // Configurar paginación
          this.nextCursor = response.nextCursor;
          this.hasMoreMessages.set(response.hasMore);

          this.shouldScrollToBottom = true;
          this.loading.set(false);

          // Unirse a la sala de WebSocket
          this.chatService.webSocketService.joinRoom(chatId);

          // Cargar presencia inicial del chat
          this.loadChatPresence(chatId);

          // Configurar scroll infinito si hay más mensajes
          if (response.hasMore) {
            setTimeout(() => {
              this.setupIntersectionObserver();
            }, 500);
          }

          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('[ChatWidget] Error al cargar mensajes:', err);
          this.error.set('No se pudieron cargar los mensajes.');
          this.loading.set(false);
          this.cdr.detectChanges();
        },
      });
  }

  /**
   * Cargar presencia inicial del chat
   */
  private loadChatPresence(chatId: string): void {
    console.log('[ChatWidget] 📡 Cargando presencia para chat:', chatId);

    this.presenceService.getChatPresence(chatId).subscribe({
      next: (presence) => {
        console.log('[ChatWidget] Presencia cargada:', presence);

        // Buscar el participante visitante
        const visitor = this.currentVisitor();
        if (!visitor) return;

        const visitorParticipant = presence.participants.find(
          (p) => p.userId === visitor.id
        );
        if (visitorParticipant) {
          console.log(
            '[ChatWidget] Estado de presencia del visitante:',
            visitorParticipant.connectionStatus
          );
          this.visitorPresenceStatus.set(visitorParticipant.connectionStatus);
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        console.error('[ChatWidget] Error al cargar presencia:', err);
        // No mostrar error al usuario, es información complementaria
      },
    });
  }

  /**
   * Agregar un mensaje a la lista
   */
  private addMessageToList(message: Message): void {
    const currentMessages = this.messages();

    // Evitar duplicados
    const exists = currentMessages.some(
      (m) => m.messageId === message.messageId
    );
    if (!exists) {
      console.log('[ChatWidget] ➕ Agregando mensaje a la lista:', {
        messageId: message.messageId,
        senderId: message.senderId,
        senderType: message.senderType,
        currentUserId: this.currentUserId(),
        willBeOwnMessage: this.isOwnMessage(message),
      });
      this.messages.set([...currentMessages, message]);
    } else {
      console.log(
        '[ChatWidget] ⏭️ Mensaje duplicado, no se agrega:',
        message.messageId
      );
    }
  }

  /**
   * Enviar mensaje
   */
  onSendMessage(content: string): void {
    if (!this.commercialPresence.getCurrentStatus().isConnected) {
      this.error.set('Conéctate para poder enviar mensajes');
      return;
    }

    const chatId = this.currentChatId();
    const visitor = this.currentVisitor();

    // Si no hay chatId, es el primer mensaje - crear el chat primero
    if (!chatId && visitor) {
      console.log(
        '[ChatWidget] 🆕 Primer mensaje - creando chat con mensaje:',
        content
      );
      this.createChatWithFirstMessage(visitor, content);
      return;
    }

    // Si ya hay chatId, enviar mensaje normal
    // ✨ Obtener userId DIRECTAMENTE del UserService (no usar ChatService)
    const currentUserId = this.userService.getUserId();

    if (!chatId || !currentUserId) {
      console.error(
        '[ChatWidget] No se puede enviar mensaje: falta chatId o userId'
      );
      return;
    }

    const request: SendMessageRequest = {
      chatId,
      content,
      type: 'text',
    };

    console.log('[ChatWidget] Enviando mensaje:', request);
    console.log(
      '[ChatWidget] 🔑 CurrentUserId para mensaje optimista:',
      currentUserId
    );

    // Agregar mensaje optimista
    const optimisticMessage: Message = {
      messageId: `temp-${Date.now()}`,
      chatId,
      senderId: currentUserId,
      senderType: 'COMMERCIAL',
      content,
      type: 'TEXT',
      sentAt: new Date(),
      status: 'SENT',
    };

    console.log('[ChatWidget] 📤 Mensaje optimista creado:', {
      messageId: optimisticMessage.messageId,
      senderId: optimisticMessage.senderId,
      senderType: optimisticMessage.senderType,
      currentUserIdSignal: this.currentUserId(),
    });

    this.addMessageToList(optimisticMessage);
    this.shouldScrollToBottom = true;
    this.cdr.detectChanges();

    // 🔑 Si el chat es pendiente, asignarlo al comercial al enviar el primer mensaje
    const wasPending = this.isPendingChat();
    if (wasPending) {
      console.log(
        '[ChatWidget] 🔄 Chat pendiente - asignando al comercial antes de enviar mensaje'
      );
      this.assignPendingChatToCurrentUser(chatId);
    }

    // Enviar mensaje al servidor
    this.chatService.sendMessage(request).subscribe({
      next: (message) => {
        if (message) {
          console.log('[ChatWidget] 📥 Mensaje recibido del servidor:', {
            messageId: message.messageId,
            senderId: message.senderId,
            senderType: message.senderType,
            currentUserIdSignal: this.currentUserId(),
          });

          // Reemplazar mensaje optimista con el real
          const messages = this.messages().filter(
            (m) => m.messageId !== optimisticMessage.messageId
          );
          this.messages.set([...messages, message]);
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        console.error('[ChatWidget] Error al enviar mensaje:', err);
        // Eliminar mensaje optimista en caso de error
        const messages = this.messages().filter(
          (m) => m.messageId !== optimisticMessage.messageId
        );
        this.messages.set(messages);
        this.error.set('No se pudo enviar el mensaje.');
        this.cdr.detectChanges();
      },
    });
  }

  /**
   * Asignar chat pendiente al comercial actual
   */
  private assignPendingChatToCurrentUser(chatId: string): void {
    const currentUserId = this.userService.getUserId();

    if (!currentUserId) {
      console.error('[ChatWidget] ❌ No se puede asignar chat: falta userId');
      return;
    }

    console.log(
      '[ChatWidget] 🚀 Asignando chat pendiente:',
      chatId,
      'al comercial:',
      currentUserId
    );

    // Marcar como asignado en el servicio (optimista)
    this.widgetService.markChatAsAssigned();
    this.isPendingChat.set(false);

    // Llamar al backend para asignar el chat
    this.visitorsService
      .assignChatToCommercial(chatId, currentUserId)
      .subscribe({
        next: (response) => {
          console.log('[ChatWidget] ✅ Chat asignado exitosamente:', response);

          // 🔥 BUGFIX: Unirse a la sala de WebSocket para recibir notificaciones
          // Cuando un chat pendiente es asignado al agente, debemos suscribirnos
          // a su sala de WebSocket para recibir mensajes nuevos del visitante
          console.log(
            '[ChatWidget] 🔌 Uniéndose a sala de WebSocket para notificaciones:',
            chatId
          );
          this.chatService.webSocketService.joinRoom(chatId);
        },
        error: (err) => {
          console.error(
            '[ChatWidget] ❌ Error al asignar chat pendiente:',
            err
          );
          // No revertimos la UI porque el mensaje ya fue enviado
          // El backend debería haber asignado el chat implícitamente al recibir el mensaje
        },
      });
  }

  /**
   * Minimizar widget
   */
  onMinimize(): void {
    this.widgetService.minimizeWidget();
  }

  /**
   * Restaurar widget desde minimizado
   */
  onRestore(): void {
    this.widgetService.restoreWidget();
  }

  /**
   * Cerrar widget
   */
  onClose(): void {
    const chatId = this.currentChatId();
    console.log('[ChatWidget] 🚪 Cerrando widget - Chat:', chatId);

    if (chatId) {
      // Salir de la sala de WebSocket
      this.chatService.webSocketService.leaveRoom(chatId);
    }

    // ✅ LIMPIAR CHAT ACTIVO - Ya no hay chat visible
    this.unreadMessagesService.setActiveChat(null);
    console.log('[ChatWidget] 👁️ Chat activo limpiado');

    // Limpiar completamente el estado
    this.messages.set([]);
    this.error.set(null);
    this.loading.set(false);
    this.currentChatId.set(null);
    this.currentVisitor.set(null);
    this.visitorPresenceStatus.set(undefined);

    this.widgetService.closeWidget();
  }

  /**
   * Alternar entre abierto y minimizado
   */
  onToggleMinimize(): void {
    this.widgetService.toggleMinimize();
  }

  /**
   * Manejar selección de pestaña
   */
  onTabSelect(chatId: string): void {
    const currentChatId = this.currentChatId();

    // Si es la misma pestaña, no hacer nada
    if (chatId === currentChatId) return;

    console.log('[ChatWidget] Cambiando a pestaña:', chatId);

    // Guardar mensajes actuales en caché antes de cambiar
    if (currentChatId) {
      this.messagesCache.set(currentChatId, this.messages());
    }

    // Cambiar de pestaña en el servicio
    this.widgetService.switchTab(chatId);

    // Cargar mensajes de la nueva pestaña (desde caché si está disponible)
    const cachedMessages = this.messagesCache.get(chatId);
    if (cachedMessages && cachedMessages.length > 0) {
      console.log('[ChatWidget] Usando mensajes en caché para:', chatId);
      this.messages.set(cachedMessages);
      this.shouldScrollToBottom = true;

      // ✅ MARCAR CHAT COMO ACTIVO - También cuando se usan mensajes de caché
      this.unreadMessagesService.setActiveChat(chatId);
      console.log('[ChatWidget] 👁️ Chat de caché marcado como activo:', chatId);
    } else {
      // Si no hay caché, cargar desde el servidor (loadMessages ya llama setActiveChat)
      this.loadMessages(chatId);
    }
  }

  /**
   * Manejar cierre de pestaña (cierra el chat)
   */
  onTabClose(chatId: string): void {
    console.log('[ChatWidget] Cerrando chat de pestaña:', chatId);

    // Limpiar caché de esta pestaña
    this.messagesCache.delete(chatId);

    // Salir de la sala WebSocket
    this.chatService.webSocketService.leaveRoom(chatId);

    // Cerrar el chat en el servidor
    this.chatService.closeChat(chatId).subscribe({
      next: () => {
        console.log('[ChatWidget] Chat cerrado exitosamente:', chatId);
      },
      error: (err: unknown) => {
        console.error('[ChatWidget] Error al cerrar chat:', err);
      },
    });

    // Cerrar la pestaña en el servicio
    this.widgetService.closeTab(chatId);
  }

  /**
   * Scroll al final del contenedor de mensajes
   */
  private scrollToBottom(): void {
    if (this.messagesContainer) {
      const element = this.messagesContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }

  /**
   * Detectar si el usuario está cerca del final del scroll
   */
  onScroll(): void {
    if (this.messagesContainer) {
      const element = this.messagesContainer.nativeElement;
      const threshold = 150;
      this.isNearBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight <
        threshold;
    }
  }

  /**
   * Formatear fecha del mensaje
   */
  formatMessageTime(date: Date): string {
    const messageDate = new Date(date);
    return messageDate.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Verificar si el mensaje es del usuario actual
   */
  isOwnMessage(message: Message): boolean {
    // ✨ Obtener userId DIRECTAMENTE del UserService (no usar ChatService)
    const currentUserId = this.userService.getUserId();

    if (!currentUserId || !message.senderId) {
      return false;
    }

    // ✅ Comparar senderId del mensaje con el userId actual
    return message.senderId === currentUserId;
  }

  /**
   * Verificar si es un mensaje del sistema
   */
  isSystemMessage(message: Message): boolean {
    return message.senderType === 'SYSTEM';
  }

  /**
   * Obtener nombre para mostrar del chat
   */
  getChatDisplayName(): string {
    const visitor = this.currentVisitor();
    if (!visitor) return 'Chat';

    // El nombre debe venir enriquecido desde la feature (Visitors / Atención)
    if (
      visitor.name &&
      visitor.name.trim() &&
      visitor.name.trim().toLowerCase() !== 'visitante anónimo' &&
      visitor.name.trim().toLowerCase() !== 'visitante'
    ) {
      return visitor.name.trim();
    }

    if (visitor.email && visitor.email.trim()) {
      return visitor.email.trim();
    }

    return 'Visitante anónimo';
  }

  /**
   * Obtener información del estado del chat para el header
   * Retorna el badge de presencia del visitante con:
   * - label: Texto a mostrar (ej: "En línea", "Ausente", etc.)
   * - color: Color del badge ('success', 'warning', 'danger', 'neutral')
   */
  getChatStatusInfo(): { label: string; color: string } {
    return this.visitorPresenceBadge();
  }

  /**
   * Verificar si debe mostrar separador de fecha
   */
  shouldShowDateSeparator(index: number): boolean {
    const messages = this.messages();
    if (index === 0) return true; // Siempre mostrar para el primer mensaje

    const currentMessage = messages[index];
    const previousMessage = messages[index - 1];

    if (!currentMessage || !previousMessage) return false;

    const currentDate = new Date(currentMessage.sentAt);
    const previousDate = new Date(previousMessage.sentAt);

    // Mostrar si son días diferentes
    return currentDate.toDateString() !== previousDate.toDateString();
  }

  /**
   * Formatear separador de fecha
   */
  formatDateSeparator(date: Date): string {
    const messageDate = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (messageDate.toDateString() === today.toDateString()) {
      return 'Hoy';
    } else if (messageDate.toDateString() === yesterday.toDateString()) {
      return 'Ayer';
    } else {
      return messageDate.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
  }

  /**
   * Obtener etiqueta del remitente
   */
  getSenderLabel(message: Message): string {
    if (this.isOwnMessage(message)) {
      return 'Tú';
    }

    const visitor = this.currentVisitor();
    return visitor?.name || visitor?.email || 'Visitante';
  }

  /**
   * Track by para ngFor de mensajes
   */
  trackMessageById(_index: number, message: Message): string {
    return message.messageId;
  }

  /**
   * Configurar IntersectionObserver para scroll infinito
   */
  private setupIntersectionObserver(): void {
    console.log(
      '[ChatWidget] Configurando IntersectionObserver para scroll infinito'
    );

    if (!this.scrollAnchor || !this.messagesContainer) {
      console.warn(
        '[ChatWidget] No se puede configurar observer: elementos no disponibles'
      );
      return;
    }

    this.cleanupIntersectionObserver();

    const options: IntersectionObserverInit = {
      root: this.messagesContainer.nativeElement,
      rootMargin: '50px',
      threshold: 0.1,
    };

    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        console.log('[ChatWidget] IntersectionObserver:', {
          isIntersecting: entry.isIntersecting,
          isLoadingMore: this.isLoadingMore(),
          hasMoreMessages: this.hasMoreMessages(),
          isHandlingIntersection: this.isHandlingIntersection,
        });

        if (
          entry.isIntersecting &&
          !this.isLoadingMore() &&
          this.hasMoreMessages() &&
          !this.isHandlingIntersection
        ) {
          console.log('[ChatWidget] ✅ Cargando más mensajes antiguos');
          this.isHandlingIntersection = true;
          this.loadMoreMessages();
        }
      });
    }, options);

    this.intersectionObserver.observe(this.scrollAnchor.nativeElement);
    console.log('[ChatWidget] IntersectionObserver configurado');
  }

  /**
   * Limpiar IntersectionObserver
   */
  private cleanupIntersectionObserver(): void {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = undefined;
      console.log('[ChatWidget] IntersectionObserver limpiado');
    }
  }

  /**
   * Cargar más mensajes antiguos (scroll infinito)
   */
  private loadMoreMessages(): void {
    const chatId = this.currentChatId();
    if (!chatId || this.isLoadingMore() || !this.hasMoreMessages()) {
      console.log('[ChatWidget] No se puede cargar más mensajes:', {
        chatId: !!chatId,
        isLoadingMore: this.isLoadingMore(),
        hasMore: this.hasMoreMessages(),
      });
      return;
    }

    console.log(
      '[ChatWidget] 📥 Cargando mensajes antiguos con cursor:',
      this.nextCursor
    );
    this.isLoadingMore.set(true);
    this.previousScrollHeight =
      this.messagesContainer?.nativeElement.scrollHeight || 0;

    this.chatService
      .getMessagesV2(chatId, {
        cursor: this.nextCursor,
        limit: 50,
        // El endpoint por defecto devuelve sentAt DESC
      })
      .subscribe({
        next: (response: MessageListResponse) => {
          console.log(
            '[ChatWidget] Mensajes antiguos cargados:',
            response.messages.length
          );

          // Los mensajes vienen en orden descendente
          // Los revertimos y los agregamos AL INICIO del array existente
          const newMessages = [...response.messages].reverse();
          const currentMessages = this.messages();
          this.messages.set([...newMessages, ...currentMessages]);

          // Actualizar paginación
          this.nextCursor = response.nextCursor;
          this.hasMoreMessages.set(response.hasMore);
          this.isLoadingMore.set(false);
          this.isHandlingIntersection = false;

          // Preservar posición de scroll
          this.preserveScrollPosition();

          // Reconfigurar observer si hay más mensajes
          if (response.hasMore) {
            this.cleanupIntersectionObserver();
            setTimeout(() => {
              this.setupIntersectionObserver();
            }, 200);
          } else {
            this.cleanupIntersectionObserver();
          }

          this.cdr.detectChanges();
        },
        error: (err: unknown) => {
          console.error('[ChatWidget] Error al cargar mensajes antiguos:', err);
          this.isLoadingMore.set(false);
          this.isHandlingIntersection = false;
          this.cdr.detectChanges();
        },
      });
  }

  /**
   * Preservar posición de scroll al agregar mensajes antiguos
   */
  private preserveScrollPosition(): void {
    if (!this.messagesContainer) return;

    const element = this.messagesContainer.nativeElement;
    const newScrollHeight = element.scrollHeight;
    const scrollDiff = newScrollHeight - this.previousScrollHeight;

    // Ajustar scroll para mantener la posición visual
    element.scrollTop = element.scrollTop + scrollDiff;

    console.log('[ChatWidget] Posición de scroll preservada:', {
      previousHeight: this.previousScrollHeight,
      newHeight: newScrollHeight,
      scrollDiff,
      newScrollTop: element.scrollTop,
    });
  }
}
