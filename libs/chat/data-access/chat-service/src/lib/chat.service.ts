import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, map, catchError, of, filter } from 'rxjs';
import { 
  Chat, 
  Message, 
  CreateChatRequest, 
  CreateChatWithMessageRequest, 
  SendMessageRequest, 
  MarkAsReadRequest,
  CreateChatResponse,
  User,
  MessageListResponse
} from '@guiders-frontend/shared/types';
import { ENVIRONMENT_TOKEN, UserService } from '@guiders-frontend/auth/data-access/session';
import { SelfChatService } from '@guiders-frontend/self-chat';

const SELF_CHAT_PREFIX = 'self-';
import { WebSocketService, ChatStatusUpdate } from '@guiders-frontend/chat/data-access/websocket-service';

// Tipos internos para las respuestas de la API
interface ApiChatResponse {
  // Campos comunes a ambos formatos
  id?: string; // Nuevo formato del backend
  chatId?: string; // Formato anterior
  status: 'PENDING' | 'ACTIVE' | 'CLOSED' | 'TRANSFERRED' | 'ASSIGNED'; // ASSIGNED es el nuevo estado
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'NORMAL'; // NORMAL es nueva prioridad

  // Campos del formato anterior
  department?: string;
  subject?: string;
  visitorId?: string;
  commercialId?: string;

  // Campos del nuevo formato del backend
  visitorInfo?: {
    id: string;
    name?: string;
    email?: string;
    additionalData?: Record<string, unknown>;
  };
  assignedCommercialId?: string;
  availableCommercialIds?: string[];
  metadata?: {
    department?: string;
    source?: string;
    tags?: string[];
    customFields?: Record<string, unknown>;
  };

  // Campos comunes
  queuePosition?: number;
  estimatedWaitTime?: number;
  lastMessage?: ApiMessageResponse;
  lastMessagePreview?: string; // Preview del último mensaje (nuevo formato)
  lastMessageDate?: string; // Fecha del último mensaje (nuevo formato)
  unreadCount?: number;
  unreadMessagesCount?: number; // Nuevo formato
  totalMessages?: number; // Nuevo formato
  isActive?: boolean; // Nuevo formato

  // Fechas
  createdAt: string;
  updatedAt: string;
  closedAt?: string;

  // Campos adicionales del nuevo formato
  tags?: string[];
}

interface ApiMessageResponse {
  // Campos que pueden venir en diferentes formatos
  id?: string; // Formato nuevo del backend
  messageId?: string; // Formato anterior
  chatId: string;
  senderId: string;
  senderType?: 'VISITOR' | 'COMMERCIAL' | 'SYSTEM';
  content: string;
  type: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM';
  
  // Fechas en diferentes formatos
  sentAt?: string; // Formato anterior
  createdAt?: string; // Formato nuevo del backend
  
  status?: 'SENT' | 'DELIVERED' | 'READ';
  replyTo?: string;
  edited?: boolean;
  editedAt?: string;
  updatedAt?: string; // Formato nuevo del backend
  metadata?: Record<string, unknown>;
  
  // Campos adicionales del nuevo formato
  isInternal?: boolean;
  isFirstResponse?: boolean;
}

// Tipo para mensajes del WebSocket (pueden venir con sentAt como string o Date)
interface WebSocketMessage {
  messageId: string;
  chatId: string;
  senderId: string;
  senderType: 'VISITOR' | 'COMMERCIAL' | 'SYSTEM';
  content: string;
  type: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM';
  sentAt: string | Date;
  status: 'SENT' | 'DELIVERED' | 'READ';
  replyTo?: string;
  edited?: boolean;
  editedAt?: string | Date;
  metadata?: Record<string, unknown>;
}

interface CreateChatWithMessageResponse {
  chatId: string;
  messageId: string;
  position: number;
}

interface ApiGetChatsResponse {
  chats: ApiChatResponse[];
  // Campos del formato anterior
  pagination?: {
    hasNext: boolean;
    cursor?: string;
    total?: number;
  };
  // Campos del nuevo formato del backend
  total?: number;
  hasMore?: boolean;
  nextCursor?: string | null;
}

interface ApiGetMessagesResponse {
  messages: ApiMessageResponse[];
  pagination?: {
    hasNext: boolean;
    cursor?: string;
    total?: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly environment = inject(ENVIRONMENT_TOKEN);
  private readonly webSocket = inject(WebSocketService);
  private readonly userService = inject(UserService);
  private readonly selfChat = inject(SelfChatService);
  private readonly baseUrl = `${this.environment.api.baseUrl}/v2`;
  
  // Estado global del chat
  private readonly chatsSubject = new BehaviorSubject<Chat[]>([]);
  private readonly selectedChatSubject = new BehaviorSubject<string | null>(null);
  private readonly messagesSubject = new BehaviorSubject<{ [chatId: string]: Message[] }>({});
  private readonly loadingSubject = new BehaviorSubject<boolean>(false);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);

  // Observables públicos
  readonly chats$ = this.chatsSubject.asObservable();
  readonly selectedChat$ = this.selectedChatSubject.asObservable();
  readonly messages$ = this.messagesSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  private currentUserId: string | null = null;
  private authToken: string | null = null;

  constructor() {
    // ✨ Usar UserService para obtener el userId (BFF authentication)
    this.currentUserId = this.userService.getUserId();
    console.log('[ChatService] Usuario actual inicializado desde UserService:', this.currentUserId);

    // ⚠️ No llamar a webSocket.connect() aquí: el WebSocket se conecta
    // desde app.config.ts después de que el usuario está autenticado y
    // provisionado. Llamarlo en el constructor causa intentos de conexión
    // fallidos cuando el usuario no está en el backend (ej. admin-wp).

    // Bridge SelfChatService → chats$/messages$ streams (Microsoft Teams-style self chat)
    this.bridgeSelfChat();
  }

  /**
   * Returns true if the given chatId belongs to the per-user self chat.
   * Self chats follow the convention `self-{userId}` and live entirely
   * client-side (no backend round-trip).
   */
  isSelfChatId(chatId: string | null | undefined): boolean {
    return typeof chatId === 'string' && chatId.startsWith(SELF_CHAT_PREFIX);
  }

  private bridgeSelfChat(): void {
    this.selfChat.chat$.subscribe(() => {
      const merged = this.mergeWithSelfChat(this.chatsSubject.value);
      this.chatsSubject.next(merged);
    });

    this.selfChat.messages$.subscribe((messages) => {
      const selfChatId = this.selfChat.currentChat?.chatId;
      if (!selfChatId) return;
      const current = this.messagesSubject.value;
      this.messagesSubject.next({ ...current, [selfChatId]: messages });
    });
  }

  /**
   * Garantiza que el self-chat (si existe) esté pinneado al inicio de la lista.
   * Usado tanto por el bridge reactivo como por los handlers HTTP que
   * reemplazan completamente la lista de chats.
   */
  private mergeWithSelfChat(chats: Chat[]): Chat[] {
    const selfChat = this.selfChat.currentChat;
    const others = chats.filter((c) => !this.isSelfChatId(c.chatId));
    return selfChat ? [selfChat, ...others] : others;
  }

  /**
   * Inicializar conexión WebSocket y suscribirse a eventos
   */
  private initializeWebSocket(): void {
    // Conectar al servidor WebSocket
    this.webSocket.connect({
      authToken: this.authToken,
      autoConnect: true
    });

    // Suscribirse a mensajes nuevos
    this.webSocket.messageReceived$
      .pipe(filter((message): message is Message => message !== null))
      .subscribe(message => {
        console.log('[ChatService] Mensaje recibido via WebSocket:', message);
        console.log('[ChatService] Comparando senderId:', message.senderId, 'con currentUserId:', this.currentUserId);
        
        // Ignorar mensajes propios - ya fueron agregados por la respuesta HTTP
        if (message.senderId === this.currentUserId) {
          console.log('[ChatService] ✅ Mensaje propio ignorado (ya fue agregado por HTTP):', message.messageId);
          return;
        }
        
        console.log('[ChatService] ✅ Mensaje de otro usuario, agregando al estado');
        // Normalizar el mensaje para asegurar que sentAt sea Date
        const normalizedMessage = this.normalizeMessage(message);
        this.addMessageToState(normalizedMessage.chatId, normalizedMessage);
      });

    // Suscribirse a cambios de estado del chat
    this.webSocket.chatStatus$
      .pipe(filter((status): status is ChatStatusUpdate => status !== null))
      .subscribe(status => {
        console.log('[ChatService] Estado del chat actualizado:', status);
        this.updateChatStatus(status.chatId, status.status);
      });
  }

  // Configuración de headers para autenticación
  private getHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    if (this.authToken) {
      headers = headers.set('Authorization', `Bearer ${this.authToken}`);
    }

    // Agregar CSRF token si está disponible
    const csrfToken = this.getCsrfToken();
    if (csrfToken) {
      headers = headers.set('X-CSRF-Token', csrfToken);
    }

    return headers;
  }

  // Configuración de opciones HTTP con credenciales
  private getHttpOptions(): { headers: HttpHeaders; withCredentials: boolean } {
    return {
      headers: this.getHeaders(),
      withCredentials: true
    };
  }

  // Obtener token CSRF desde meta tag, cookie o endpoint
  private getCsrfToken(): string | null {
    // 1. Intentar obtener desde meta tag
    const metaTag = document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement;
    if (metaTag && metaTag.content) {
      return metaTag.content;
    }

    // 2. Intentar obtener desde cookie no-HttpOnly (si está configurada así)
    const cookieMatch = document.cookie.match(/(?:^|;\s*)csrf-token\s*=\s*([^;]+)/);
    if (cookieMatch) {
      return cookieMatch[1];
    }

    // 3. En una implementación real, podrías hacer una petición a /api/v2/csrf
    // para obtener el token cuando no esté disponible por otros medios
    return null;
  }

  /**
   * Obtener token CSRF desde el endpoint del BFF
   * Este método puede ser llamado al inicializar la aplicación
   */
  fetchCsrfToken(): Observable<string | null> {
    return this.http.get<{ token: string }>(`${this.baseUrl}/csrf`, { 
      withCredentials: true 
    }).pipe(
      map(response => {
        // Opcional: almacenar el token en una meta tag para uso futuro
        let metaTag = document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement;
        if (!metaTag) {
          metaTag = document.createElement('meta');
          metaTag.name = 'csrf-token';
          document.head.appendChild(metaTag);
        }
        metaTag.content = response.token;
        return response.token;
      }),
      catchError(error => {
        console.warn('No se pudo obtener el token CSRF:', error);
        return of(null);
      })
    );
  }

  // Configurar usuario actual y token
  setCurrentUser(userId: string, token: string): void {
    this.currentUserId = userId;
    this.authToken = token;
    localStorage.setItem('user-id', userId);
    localStorage.setItem('access-token', token);
  }

  getCurrentUserId(): string | null {
    // ✨ Obtener userId DIRECTAMENTE del UserService (BFF authentication)
    const userId = this.userService.getUserId();
    
    if (userId) {
      this.currentUserId = userId;
      return userId;
    }
    
    // Fallback: devolver el valor en caché si existe
    return this.currentUserId;
  }

  // ===== MÉTODOS DE CHAT =====

  /**
   * Obtener chats de un visitante asignados al comercial actual
   * GET /api/v2/chats/visitor/:visitorId/my-chat
   * @param visitorId - ID del visitante
   * @returns Observable con los chats asignados al comercial actual para ese visitante
   */
  getVisitorMyChats(visitorId: string): Observable<{
    chats: Chat[];
    total: number;
    totalVisitorChats: number;
    hasMore: boolean;
    nextCursor?: string | null;
  }> {
    this.setLoading(true);

    return this.http.get<{
      chats: ApiChatResponse[];
      total: number;
      totalVisitorChats: number;
      hasMore: boolean;
      nextCursor?: string | null;
    }>(`${this.baseUrl}/chats/visitor/${visitorId}/my-chat`, this.getHttpOptions())
      .pipe(
        map(response => {
          const chats = this.transformChatsFromApi(response.chats);
          this.setLoading(false);
          return {
            chats,
            total: response.total,
            totalVisitorChats: response.totalVisitorChats,
            hasMore: response.hasMore,
            nextCursor: response.nextCursor
          };
        }),
        catchError(error => {
          this.handleError('Error al obtener chats del visitante', error);
          return of({
            chats: [],
            total: 0,
            totalVisitorChats: 0,
            hasMore: false,
            nextCursor: null
          });
        })
      );
  }

  /**
   * Obtener lista de chats para un comercial específico
   */
  getCommercialChats(commercialId: string, options?: {
    cursor?: string;
    limit?: number;
    filters?: {
      status?: string[];
      priority?: string[];
      department?: string;
      dateFrom?: string;
      dateTo?: string;
    };
    sort?: {
      field?: string;
      direction?: 'asc' | 'desc';
    };
  }): Observable<Chat[]> {
    this.setLoading(true);
    
    let url = `${this.baseUrl}/commercials/${commercialId}/chats`;
    const params = new URLSearchParams();
    
    if (options?.cursor) params.append('cursor', options.cursor);
    if (options?.limit) params.append('limit', options.limit.toString());
    
    // Filtros como JSON: Nest ValidationPipe rechaza filters[status][]
    if (options?.filters) {
      const filterPayload: Record<string, unknown> = {};
      if (options.filters.status?.length) {
        filterPayload['status'] = options.filters.status;
      }
      if (options.filters.priority?.length) {
        filterPayload['priority'] = options.filters.priority;
      }
      if (options.filters.department) {
        filterPayload['department'] = options.filters.department;
      }
      if (options.filters.dateFrom) {
        filterPayload['dateFrom'] = options.filters.dateFrom;
      }
      if (options.filters.dateTo) {
        filterPayload['dateTo'] = options.filters.dateTo;
      }
      if (Object.keys(filterPayload).length > 0) {
        params.append('filters', JSON.stringify(filterPayload));
      }
    }

    // Ordenamiento (JSON; el backend espera ASC/DESC)
    if (options?.sort?.field) {
      const direction =
        (options.sort.direction || 'desc').toUpperCase() === 'ASC'
          ? 'ASC'
          : 'DESC';
      params.append(
        'sort',
        JSON.stringify({
          field: options.sort.field,
          direction,
        })
      );
    }
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    return this.http.get<ApiGetChatsResponse>(url, this.getHttpOptions())
      .pipe(
        map(response => {
          const chats = this.transformChatsFromApi(response.chats);
          this.chatsSubject.next(this.mergeWithSelfChat(chats));
          this.setLoading(false);
          return chats;
        }),
        catchError(error => {
          this.handleError('Error al obtener chats del comercial', error);
          return of([]);
        })
      );
  }

  /**
   * Obtener lista de chats con filtros y paginación (método genérico)
   */
  getChats(filters?: {
    status?: string;
    department?: string;
    limit?: number;
    cursor?: string;
  }): Observable<Chat[]> {
    // Si tenemos un usuario comercial, usar el endpoint específico
    const currentUserId = this.getCurrentUserId();
    if (currentUserId) {
      return this.getCommercialChats(currentUserId, {
        cursor: filters?.cursor,
        limit: filters?.limit,
        filters: {
          status: filters?.status ? [filters.status] : undefined,
          department: filters?.department
        }
      });
    }
    
    // Fallback al endpoint genérico si no hay usuario
    this.setLoading(true);
    
    let url = `${this.baseUrl}/chats`;
    const params = new URLSearchParams();
    
    if (filters?.status) params.append('status', filters.status);
    if (filters?.department) params.append('department', filters.department);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.cursor) params.append('cursor', filters.cursor);
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    return this.http.get<ApiGetChatsResponse>(url, this.getHttpOptions())
      .pipe(
        map(response => {
          const chats = this.transformChatsFromApi(response.chats);
          this.chatsSubject.next(this.mergeWithSelfChat(chats));
          this.setLoading(false);
          return chats;
        }),
        catchError(error => {
          this.handleError('Error al obtener chats', error);
          return of([]);
        })
      );
  }

  /**
   * Obtener chat específico por ID
   */
  getChat(chatId: string): Observable<Chat | null> {
    this.setLoading(true);
    
    return this.http.get<ApiChatResponse>(`${this.baseUrl}/chats/${chatId}`, 
      this.getHttpOptions()
    ).pipe(
      map(chat => {
        this.setLoading(false);
        return this.transformChatFromApi(chat);
      }),
      catchError(error => {
        this.handleError('Error al obtener chat', error);
        return of(null);
      })
    );
  }

  /**
   * Crear nuevo chat
   */
  createChat(request: CreateChatRequest): Observable<Chat | null> {
    this.setLoading(true);
    
    return this.http.post<CreateChatResponse>(`${this.baseUrl}/chats`, request, 
      this.getHttpOptions()
    ).pipe(
      map(response => {
        this.setLoading(false);
        // Después de crear, obtener el chat completo
        this.getChat(response.chatId).subscribe();
        return null; // Retornamos null porque necesitamos hacer otra llamada
      }),
      catchError(error => {
        this.handleError('Error al crear chat', error);
        return of(null);
      })
    );
  }

  /**
   * Crear chat con primer mensaje
   */
  createChatWithMessage(request: CreateChatWithMessageRequest): Observable<{ chatId: string; messageId: string; position: number } | null> {
    this.setLoading(true);
    
    return this.http.post<CreateChatWithMessageResponse>(`${this.baseUrl}/chats/with-message`, request, 
      this.getHttpOptions()
    ).pipe(
      map(response => {
        this.setLoading(false);
        console.log('[ChatService] Chat creado con respuesta:', response);
        
        // La respuesta ahora solo contiene IDs: { chatId, messageId, position }
        // El componente puede usar estos IDs para cargar los datos completos si es necesario
        
        return response;
      }),
      catchError(error => {
        this.handleError('Error al crear chat con mensaje', error);
        return of(null);
      })
    );
  }

  // ===== MÉTODOS DE MENSAJES =====

  /**
   * Obtener mensajes de un chat con el endpoint V2 (incluye paginación completa)
   * Retorna la respuesta completa con información de paginación cursor
   */
  getMessagesV2(chatId: string, options?: {
    cursor?: string;
    limit?: number;
    filters?: {
      types?: string[];
      dateFrom?: string;
      dateTo?: string;
      senderId?: string;
      senderType?: string;
      isRead?: boolean;
      hasAttachments?: boolean;
      keyword?: string;
    };
    sort?: {
      field?: 'sentAt' | 'readAt' | 'type';
      direction?: 'ASC' | 'DESC';
    };
  }): Observable<MessageListResponse> {
    this.setLoading(true);

    const baseUrl = this.baseUrl || '/api/v2';
    const urlString = `${baseUrl}/messages/chat/${chatId}`;
    const url = new URL(urlString, window.location.origin);
    const params = url.searchParams;
    
    // Paginación
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.cursor) params.set('cursor', options.cursor);
    
    // Filtros
    if (options?.filters?.types) {
      options.filters.types.forEach(type => 
        params.append('filters[types][]', type)
      );
    }
    if (options?.filters?.dateFrom) {
      params.set('filters[dateFrom]', options.filters.dateFrom);
    }
    if (options?.filters?.dateTo) {
      params.set('filters[dateTo]', options.filters.dateTo);
    }
    if (options?.filters?.senderId) {
      params.set('filters[senderId]', options.filters.senderId);
    }
    if (options?.filters?.senderType) {
      params.set('filters[senderType]', options.filters.senderType);
    }
    if (options?.filters?.isRead !== undefined) {
      params.set('filters[isRead]', String(options.filters.isRead));
    }
    if (options?.filters?.hasAttachments !== undefined) {
      params.set('filters[hasAttachments]', String(options.filters.hasAttachments));
    }
    if (options?.filters?.keyword) {
      params.set('filters[keyword]', options.filters.keyword);
    }
    
    // Ordenamiento
    if (options?.sort?.field) {
      params.set('sort[field]', options.sort.field);
      params.set('sort[direction]', options.sort.direction || 'DESC');
    }

    return this.http.get<{
      messages: ApiMessageResponse[];
      total: number;
      hasMore: boolean;
      nextCursor?: string;
    }>(url.toString(), this.getHttpOptions())
      .pipe(
        map(response => {
          // Transformar mensajes pero NO revertir el orden
          // El endpoint V2 devuelve en DESC por defecto (más recientes primero)
          const messages = response.messages.map(msg => this.transformMessageFromApi(msg));
          
          this.setLoading(false);
          
          return {
            messages,
            total: response.total,
            hasMore: response.hasMore,
            nextCursor: response.nextCursor
          };
        }),
        catchError(error => {
          this.handleError('Error al obtener mensajes (V2)', error);
          return of({
            messages: [],
            total: 0,
            hasMore: false,
            nextCursor: undefined
          });
        })
      );
  }

  /**
   * Obtener mensajes de un chat
   */
  getMessages(chatId: string, options?: {
    limit?: number;
    cursor?: string;
    before?: string;
  }): Observable<Message[]> {
    this.setLoading(true);
    
    let url = `${this.baseUrl}/messages/chat/${chatId}`;
    const params = new URLSearchParams();
    
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.cursor) params.append('cursor', options.cursor);
    if (options?.before) params.append('before', options.before);
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    return this.http.get<ApiGetMessagesResponse>(url, this.getHttpOptions())
      .pipe(
        map(response => {
          // Transformar y revertir el orden: backend devuelve descendente, necesitamos ascendente
          const messages = response.messages
            .map(msg => this.transformMessageFromApi(msg))
            .reverse(); // Del más antiguo al más reciente
          
          this.setMessagesForChat(chatId, messages);
          this.setLoading(false);
          return messages;
        }),
        catchError(error => {
          this.handleError('Error al obtener mensajes', error);
          return of([]);
        })
      );
  }

  /**
   * Enviar mensaje
   */
  sendMessage(request: SendMessageRequest): Observable<Message | null> {
    // Self chats live entirely client-side: delegate to SelfChatService and skip HTTP
    if (this.isSelfChatId(request.chatId)) {
      return new Observable<Message | null>((subscriber) => {
        this.selfChat
          .sendMessage(request.content)
          .then(() => {
            const selfMessages = this.messagesSubject.value[request.chatId] ?? [];
            const last = selfMessages[selfMessages.length - 1] ?? null;
            subscriber.next(last);
            subscriber.complete();
          })
          .catch((error) => subscriber.error(error));
      });
    }

    return this.http.post<ApiMessageResponse>(`${this.baseUrl}/messages`, request, 
      this.getHttpOptions()
    ).pipe(
      map(response => {
        const message = this.transformMessageFromApi(response);
        this.addMessageToState(request.chatId, message);
        return message;
      }),
      catchError(error => {
        this.handleError('Error al enviar mensaje', error);
        return of(null);
      })
    );
  }

  /**
   * Obtener mensajes no leídos para un chat específico
   * GET /v2/messages/chat/:chatId/unread
   */
  getUnreadMessages(chatId: string): Observable<Message[]> {
    return this.http.get<ApiMessageResponse[]>(
      `${this.baseUrl}/messages/chat/${chatId}/unread`,
      this.getHttpOptions()
    ).pipe(
      map(messages => {
        return messages.map(msg => this.transformMessageFromApi(msg));
      }),
      catchError(error => {
        this.handleError('Error al obtener mensajes no leídos', error);
        return of([]);
      })
    );
  }

  /**
   * Obtener contadores de mensajes no leídos para múltiples chats
   */
  getUnreadCountsForChats(chatIds: string[]): Observable<Record<string, number>> {
    const requests = chatIds.map(chatId =>
      this.getUnreadMessages(chatId).pipe(
        map(messages => ({ chatId, count: messages.length }))
      )
    );

    return of(requests).pipe(
      map(observables => {
        const counts: Record<string, number> = {};
        observables.forEach(obs => {
          obs.subscribe(result => {
            counts[result.chatId] = result.count;
          });
        });
        return counts;
      })
    );
  }

  /**
   * Marcar mensajes como leídos
   */
  markAsRead(messageIds: string[]): Observable<boolean> {
    const request: MarkAsReadRequest = { messageIds };

    return this.http.put(`${this.baseUrl}/messages/mark-as-read`, request,
      this.getHttpOptions()
    ).pipe(
      map(() => {
        // Actualizar estado local
        this.updateMessageStatus(messageIds, 'READ');
        return true;
      }),
      catchError(error => {
        this.handleError('Error al marcar mensajes como leídos', error);
        return of(false);
      })
    );
  }

  // ===== MÉTODOS DE ESTADO =====

  selectChat(chatId: string | null): void {
    // ✅ IMPORTANTE: NO salir de la sala anterior
    // Necesitamos permanecer suscritos a TODOS los chats simultáneamente
    // para recibir notificaciones en tiempo real de cualquier chat

    // Solo actualizar el chat seleccionado
    // Las salas de WebSocket se manejan a nivel de aplicación (inbox)
    // usando joinMultipleRooms() al iniciar
    this.selectedChatSubject.next(chatId);
  }

  getSelectedChatId(): string | null {
    return this.selectedChatSubject.value;
  }

  // ===== MÉTODOS PRIVADOS =====

  private transformChatFromApi(apiChat: ApiChatResponse): Chat {
    // Normalizar campos entre los dos formatos
    const chatId = apiChat.id || apiChat.chatId || '';
    const visitorId = apiChat.visitorInfo?.id || apiChat.visitorId || '';
    const commercialId = apiChat.assignedCommercialId || apiChat.commercialId;
    const department = apiChat.metadata?.department || apiChat.department || 'general';
    const unreadCount = apiChat.unreadMessagesCount || apiChat.unreadCount || 0;

    // Crear participantes
    const participants: User[] = [];

    if (visitorId) {
      participants.push({
        id: visitorId,
        name: apiChat.visitorInfo?.name || 'Visitante',
        email: apiChat.visitorInfo?.email,
        role: 'visitor',
        status: 'online'
      });
    }

    if (commercialId) {
      participants.push({
        id: commercialId,
        name: 'Comercial',
        role: 'commercial',
        status: 'online'
      });
    }

    // Normalizar prioridad
    let priority = apiChat.priority;
    if (priority === 'NORMAL') {
      priority = 'MEDIUM'; // Mapear NORMAL a MEDIUM para consistencia
    }

    // Normalizar status
    let status = apiChat.status;
    if (status === 'ASSIGNED') {
      status = 'ACTIVE'; // Mapear ASSIGNED a ACTIVE para consistencia
    }

    // Manejar lastMessage
    let lastMessage: Message | undefined;
    if (apiChat.lastMessage) {
      // Si tenemos el objeto completo lastMessage, usarlo
      lastMessage = this.transformMessageFromApi(apiChat.lastMessage);
    } else if (apiChat.lastMessagePreview && apiChat.lastMessageDate) {
      // Si tenemos preview y fecha separados, crear un objeto Message sintético
      lastMessage = {
        messageId: 'preview', // ID sintético ya que no tenemos el real
        chatId: chatId,
        senderId: 'unknown', // No sabemos quién envió
        senderType: 'VISITOR', // Asumimos visitante por defecto
        content: apiChat.lastMessagePreview,
        type: 'TEXT',
        sentAt: new Date(apiChat.lastMessageDate),
        status: 'SENT',
        edited: false,
        metadata: {}
      };
    }

    return {
      chatId,
      status: status as 'PENDING' | 'ACTIVE' | 'CLOSED' | 'TRANSFERRED',
      priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
      department,
      subject: apiChat.subject,
      visitorId,
      commercialId,
      queuePosition: apiChat.queuePosition,
      estimatedWaitTime: apiChat.estimatedWaitTime,
      lastMessage,
      unreadCount,
      isTyping: false,
      typingUsers: [],
      createdAt: new Date(apiChat.createdAt),
      updatedAt: new Date(apiChat.updatedAt),
      closedAt: apiChat.closedAt ? new Date(apiChat.closedAt) : undefined,
      participants,
      name: apiChat.subject || apiChat.visitorInfo?.name || apiChat.visitorInfo?.email || 'Visitante',
      archived: false,
      muted: false,
      pinned: false
    };
  }

  private transformChatsFromApi(apiChats: ApiChatResponse[]): Chat[] {
    return apiChats.map(chat => this.transformChatFromApi(chat));
  }

  private transformMessageFromApi(apiMessage: ApiMessageResponse): Message {
    // Usar el campo que esté disponible (id o messageId)
    const messageId = apiMessage.messageId || apiMessage.id || '';
    
    // Usar la fecha que esté disponible (sentAt o createdAt)
    const dateString = apiMessage.sentAt || apiMessage.createdAt || new Date().toISOString();
    
    // Determinar senderType si no está presente
    let senderType: 'VISITOR' | 'COMMERCIAL' | 'SYSTEM' = apiMessage.senderType || 'VISITOR';
    if (apiMessage.type === 'SYSTEM') {
      senderType = 'SYSTEM';
    }
    
    return {
      messageId: messageId,
      chatId: apiMessage.chatId,
      senderId: apiMessage.senderId,
      senderType: senderType,
      content: apiMessage.content,
      type: apiMessage.type,
      sentAt: new Date(dateString),
      status: apiMessage.status || 'SENT',
      replyTo: apiMessage.replyTo,
      edited: apiMessage.edited,
      editedAt: apiMessage.editedAt || apiMessage.updatedAt ? 
        new Date(apiMessage.editedAt || apiMessage.updatedAt || '') : 
        undefined,
      metadata: apiMessage.metadata
    };
  }

  /**
   * Normalizar mensaje para asegurar tipos correctos
   * Los mensajes del WebSocket pueden venir con sentAt como string
   */
  private normalizeMessage(message: Message | WebSocketMessage): Message {
    return {
      messageId: message.messageId,
      chatId: message.chatId,
      senderId: message.senderId,
      senderType: message.senderType,
      content: message.content,
      type: message.type,
      sentAt: message.sentAt instanceof Date ? message.sentAt : new Date(message.sentAt),
      status: message.status,
      replyTo: message.replyTo,
      edited: message.edited,
      editedAt: message.editedAt ? 
        (message.editedAt instanceof Date ? message.editedAt : new Date(message.editedAt)) : 
        undefined,
      metadata: message.metadata
    };
  }

  private addChatToState(chat: Chat): void {
    const currentChats = this.chatsSubject.value;
    const existingIndex = currentChats.findIndex(c => c.chatId === chat.chatId);
    
    if (existingIndex >= 0) {
      currentChats[existingIndex] = chat;
    } else {
      currentChats.unshift(chat);
    }
    
    this.chatsSubject.next(this.mergeWithSelfChat([...currentChats]));
  }

  private addMessageToState(chatId: string, message: Message): void {
    const currentMessages = this.messagesSubject.value;
    const chatMessages = currentMessages[chatId] || [];
    
    // Verificar si el mensaje ya existe para evitar duplicados
    const messageExists = chatMessages.some(m => m.messageId === message.messageId);
    
    if (!messageExists) {
      // Crear un nuevo array con todos los mensajes existentes más el nuevo
      const updatedMessages = [...chatMessages, message];
      
      this.messagesSubject.next({
        ...currentMessages,
        [chatId]: updatedMessages
      });
    } else {
      console.log('[ChatService] Mensaje duplicado ignorado:', message.messageId);
    }
  }

  private setMessagesForChat(chatId: string, messages: Message[]): void {
    const currentMessages = this.messagesSubject.value;
    
    this.messagesSubject.next({
      ...currentMessages,
      [chatId]: messages
    });
  }

  private updateMessageStatus(messageIds: string[], status: 'SENT' | 'DELIVERED' | 'READ'): void {
    const currentMessages = this.messagesSubject.value;
    const updatedMessages = { ...currentMessages };
    
    Object.keys(updatedMessages).forEach(chatId => {
      updatedMessages[chatId] = updatedMessages[chatId].map(message => 
        messageIds.includes(message.messageId) 
          ? { ...message, status }
          : message
      );
    });
    
    this.messagesSubject.next(updatedMessages);
  }

  private updateChatStatus(chatId: string, newStatus: string): void {
    const currentChats = this.chatsSubject.value;
    const validStatuses: Array<'PENDING' | 'ACTIVE' | 'CLOSED' | 'TRANSFERRED' | 'ASSIGNED'> = [
      'PENDING', 'ACTIVE', 'CLOSED', 'TRANSFERRED', 'ASSIGNED'
    ];
    
    // Validar que el status sea válido
    if (!validStatuses.includes(newStatus as never)) {
      console.warn('[ChatService] Estado inválido recibido:', newStatus);
      return;
    }

    const status = newStatus as 'PENDING' | 'ACTIVE' | 'CLOSED' | 'TRANSFERRED' | 'ASSIGNED';
    const updatedChats = currentChats.map(chat => 
      chat.chatId === chatId 
        ? { ...chat, status }
        : chat
    );
    
    this.chatsSubject.next(updatedChats);
  }

  private setLoading(loading: boolean): void {
    this.loadingSubject.next(loading);
  }

  private handleError(message: string, error: unknown): void {
    console.error(message, error);
    this.errorSubject.next(message);
    this.setLoading(false);
  }

  // ===== MÉTODOS PÚBLICOS WEBSOCKET =====

  /**
   * Obtener estado de conexión WebSocket
   */
  get isWebSocketConnected(): boolean {
    return this.webSocket.isConnected();
  }

  /**
   * Obtener servicio WebSocket (para uso avanzado)
   */
  get webSocketService(): WebSocketService {
    return this.webSocket;
  }

  /**
   * Cerrar un chat (cambiar su estado a CLOSED)
   * PUT /api/v2/chats/:chatId/close
   * @param chatId - ID del chat a cerrar
   * @returns Observable con el chat actualizado
   */
  closeChat(chatId: string): Observable<Chat | null> {
    this.setLoading(true);

    return this.http.put<ApiChatResponse>(
      `${this.baseUrl}/chats/${chatId}/close`,
      {},
      this.getHttpOptions()
    ).pipe(
      map(response => {
        this.setLoading(false);
        const chat = this.transformChatFromApi(response);

        // Actualizar el estado local del chat
        this.updateChatStatus(chatId, 'CLOSED');

        return chat;
      }),
      catchError(error => {
        this.handleError('Error al cerrar chat', error);
        return of(null);
      })
    );
  }
}