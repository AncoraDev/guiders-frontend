import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, map, catchError, of } from 'rxjs';
import { 
  Chat, 
  Message, 
  CreateChatRequest, 
  CreateChatWithMessageRequest, 
  SendMessageRequest, 
  MarkAsReadRequest,
  CreateChatResponse,
  User
} from '@guiders-frontend/shared/types';
import { ENVIRONMENT_TOKEN } from '@guiders-frontend/auth/data-access/session';
import { UserService } from '@guiders-frontend/auth/data-access/session';

// Tipos internos para las respuestas de la API
interface ApiChatResponse {
  chatId: string;
  status: 'PENDING' | 'ACTIVE' | 'CLOSED' | 'TRANSFERRED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  department: string;
  subject: string;
  visitorId: string;
  commercialId?: string;
  queuePosition?: number;
  estimatedWaitTime?: number;
  lastMessage?: ApiMessageResponse;
  unreadCount?: number;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

interface ApiMessageResponse {
  messageId: string;
  chatId: string;
  senderId: string;
  senderType: 'VISITOR' | 'COMMERCIAL' | 'SYSTEM';
  content: string;
  type: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM';
  sentAt: string;
  status: 'SENT' | 'DELIVERED' | 'READ';
  replyTo?: string;
  edited?: boolean;
  editedAt?: string;
  metadata?: Record<string, unknown>;
}

interface CreateChatWithMessageResponse {
  chatId: string;
  messageId: string;
  position: number;
}

interface ApiGetChatsResponse {
  chats: ApiChatResponse[];
  pagination?: {
    hasNext: boolean;
    cursor?: string;
    total?: number;
  };
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
  private readonly userService = inject(UserService);
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
    // Inicializar con token del localStorage si existe
    this.authToken = localStorage.getItem('access-token');
    this.currentUserId = localStorage.getItem('user-id');
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
    // Intento 1: Usar el método getUserId() del UserService (preferido)
    const userId = this.userService.getUserId();
    const currentUser = this.userService.currentUser();
    console.log('[ChatService] 🔍 Debug UserService:', {
      userId,
      currentUser,
      hasUser: !!currentUser,
      userSub: currentUser?.sub
    });
    
    if (userId) {
      console.log('[ChatService] ✅ UserId desde UserService.getUserId():', userId);
      this.currentUserId = userId; // Cachear para uso futuro
      return userId;
    }
    
    // Intento 2: Caché en memoria (evita llamadas repetidas)
    if (this.currentUserId) {
      console.log('[ChatService] ✅ UserId desde caché:', this.currentUserId);
      return this.currentUserId;
    }
    
    // Intento 3: Buscar user-id guardado explícitamente (fallback para otros sistemas)
    const savedUserId = localStorage.getItem('user-id');
    if (savedUserId) {
      console.log('[ChatService] ✅ UserId desde localStorage (user-id):', savedUserId);
      this.currentUserId = savedUserId;
      return savedUserId;
    }
    
    console.warn('[ChatService] ⚠️ No se pudo obtener userId');
    console.warn('[ChatService] 💡 Verifica que:');
    console.warn('[ChatService]    1. El usuario esté autenticado');
    console.warn('[ChatService]    2. UserService.fetchUser() se haya llamado');
    console.warn('[ChatService]    3. La cookie de sesión sea válida');
    return null;
  }

  // ===== MÉTODOS DE CHAT =====

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
          this.chatsSubject.next(chats);
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
    // ✨ Obtener userId DIRECTAMENTE del UserService
    const currentUserId = this.userService.getUserId();
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
          this.chatsSubject.next(chats);
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
  createChatWithMessage(request: CreateChatWithMessageRequest): Observable<{ chatId: string; messageId: string; position: number }> {
    this.setLoading(true);
    
    return this.http.post<CreateChatWithMessageResponse>(`${this.baseUrl}/chats/with-message`, request, 
      this.getHttpOptions()
    ).pipe(
      map(response => {
        this.setLoading(false);
        console.log('[ChatService] ✅ Chat creado con mensaje:', response);
        
        // Retornar directamente la respuesta del backend
        return {
          chatId: response.chatId,
          messageId: response.messageId,
          position: response.position
        };
      }),
      catchError(error => {
        this.handleError('Error al crear chat con mensaje', error);
        throw error; // Re-lanzar el error para que el componente lo maneje
      })
    );
  }

  // ===== MÉTODOS DE MENSAJES =====

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
          const messages = response.messages.map(msg => this.transformMessageFromApi(msg));
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
    this.selectedChatSubject.next(chatId);
  }

  getSelectedChatId(): string | null {
    return this.selectedChatSubject.value;
  }

  // ===== MÉTODOS PRIVADOS =====

  private transformChatFromApi(apiChat: ApiChatResponse): Chat {
    // Crear participantes simulados (en una app real esto vendría de la API)
    const participants: User[] = [];
    
    if (apiChat.visitorId) {
      participants.push({
        id: apiChat.visitorId,
        name: 'Visitante',
        role: 'visitor',
        status: 'online'
      });
    }
    
    if (apiChat.commercialId) {
      participants.push({
        id: apiChat.commercialId,
        name: 'Comercial',
        role: 'commercial',
        status: 'online'
      });
    }

    return {
      chatId: apiChat.chatId,
      status: apiChat.status,
      priority: apiChat.priority,
      department: apiChat.department,
      subject: apiChat.subject,
      visitorId: apiChat.visitorId,
      commercialId: apiChat.commercialId,
      queuePosition: apiChat.queuePosition,
      estimatedWaitTime: apiChat.estimatedWaitTime,
      lastMessage: apiChat.lastMessage ? this.transformMessageFromApi(apiChat.lastMessage) : undefined,
      unreadCount: apiChat.unreadCount || 0,
      isTyping: false,
      typingUsers: [],
      createdAt: new Date(apiChat.createdAt),
      updatedAt: new Date(apiChat.updatedAt),
      closedAt: apiChat.closedAt ? new Date(apiChat.closedAt) : undefined,
      participants,
      name: apiChat.subject || 'Chat sin título',
      archived: false,
      muted: false,
      pinned: false
    };
  }

  private transformChatsFromApi(apiChats: ApiChatResponse[]): Chat[] {
    return apiChats.map(chat => this.transformChatFromApi(chat));
  }

  private transformMessageFromApi(apiMessage: ApiMessageResponse): Message {
    return {
      messageId: apiMessage.messageId,
      chatId: apiMessage.chatId,
      senderId: apiMessage.senderId,
      senderType: apiMessage.senderType,
      content: apiMessage.content,
      type: apiMessage.type,
      sentAt: new Date(apiMessage.sentAt),
      status: apiMessage.status,
      replyTo: apiMessage.replyTo,
      edited: apiMessage.edited,
      editedAt: apiMessage.editedAt ? new Date(apiMessage.editedAt) : undefined,
      metadata: apiMessage.metadata
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
    
    this.chatsSubject.next([...currentChats]);
  }

  private addMessageToState(chatId: string, message: Message): void {
    const currentMessages = this.messagesSubject.value;
    const chatMessages = currentMessages[chatId] || [];
    
    chatMessages.push(message);
    
    this.messagesSubject.next({
      ...currentMessages,
      [chatId]: [...chatMessages]
    });
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

  private setLoading(loading: boolean): void {
    this.loadingSubject.next(loading);
  }

  private handleError(message: string, error: unknown): void {
    console.error(message, error);
    this.errorSubject.next(message);
    this.setLoading(false);
  }
}