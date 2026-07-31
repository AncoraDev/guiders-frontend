export interface User {
  id: string;
  name: string;
  avatar?: string;
  email?: string;
  status: 'online' | 'offline' | 'away' | 'busy';
  lastSeen?: Date;
  role: 'admin' | 'commercial' | 'visitor';
}

export interface MessageSystemData {
  action?: string;
  fromUserId?: string;
  toUserId?: string;
  reason?: string;
}

export interface Message {
  messageId: string; // API usa messageId
  chatId: string;
  senderId: string;
  senderType: 'COMMERCIAL' | 'VISITOR' | 'SYSTEM'; // API usa senderType
  content: string;
  type: 'TEXT' | 'IMAGE' | 'FILE' | 'AUDIO' | 'VIDEO' | 'SYSTEM' | 'AI'; // API usa mayúsculas
  sentAt: Date; // API usa sentAt en lugar de timestamp
  status: 'SENT' | 'DELIVERED' | 'READ'; // API usa mayúsculas, no tiene 'sending'
  replyTo?: string; // ID del mensaje al que responde
  edited?: boolean;
  editedAt?: Date;
  // Campos para sistema de mensajes no leídos
  isRead?: boolean; // Indica si el mensaje ha sido leído
  readAt?: Date | null; // Fecha y hora cuando fue leído
  readBy?: string | null; // ID del usuario que leyó el mensaje
  /** Server-authoritative unread count for this chat, included in message:new WebSocket events. */
  unreadMessagesCount?: number;
  isInternal?: boolean; // Mensaje interno (solo entre comerciales)
  isFirstResponse?: boolean; // Primer mensaje de respuesta del comercial
  /** Metadatos de mensajes SYSTEM (assigned / transferred / …). */
  systemData?: MessageSystemData;
  // Campos para mensajes generados por IA
  isAI?: boolean; // Indica si el mensaje fue generado por IA
  aiMetadata?: {
    model?: string; // Modelo de IA usado (ej: "llama-3.3-70b-versatile")
    processingTimeMs?: number; // Tiempo de procesamiento en ms
    context?: {
      provider?: string; // Proveedor de IA (ej: "groq")
      triggerMessageId?: string; // ID del mensaje que disparó la respuesta
      tokensUsed?: number; // Tokens consumidos
    };
  };
  metadata?: {
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    imageUrl?: string;
    audioUrl?: string;
    videoDuration?: number;
  };
}

export interface Chat {
  chatId: string; // API usa chatId
  status: 'PENDING' | 'ACTIVE' | 'CLOSED' | 'TRANSFERRED' | 'ASSIGNED'; // Estados de la API (ASSIGNED añadido)
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'NORMAL'; // Prioridades de la API (NORMAL añadido)
  department?: string; // Departamento de la API
  subject?: string; // Asunto del chat
  visitorId: string; // ID del visitante
  commercialId?: string; // ID del comercial asignado
  queuePosition?: number; // Posición en cola
  estimatedWaitTime?: number; // Tiempo estimado de espera en segundos
  lastMessage?: Message;
  unreadCount: number;
  isTyping: boolean;
  typingUsers: User[];
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  // Propiedades adicionales para UI
  participants: User[]; // Calculado a partir de visitorId y commercialId
  name?: string; // Nombre calculado para mostrar
  avatar?: string; // Avatar calculado para mostrar
  archived: boolean;
  muted: boolean;
  pinned: boolean;
}

export interface ChatState {
  chats: Chat[];
  selectedChatId: string | null;
  messages: { [chatId: string]: Message[] };
  loading: boolean;
  error: string | null;
  searchQuery: string;
  filteredChats: Chat[];
}

export interface TypingIndicator {
  chatId: string;
  userId: string;
  userName: string;
  timestamp: Date;
}

export interface ChatConfig {
  autoRead: boolean;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  theme: 'light' | 'dark' | 'auto';
  fontSize: 'small' | 'medium' | 'large';
  showTimestamps: boolean;
  showAvatar: boolean;
}

// Tipos para las peticiones a la API
export interface CreateChatRequest {
  department?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  subject?: string;
}

export interface CreateChatWithMessageRequest {
  firstMessage: {
    content: string;
    type: 'text' | 'image' | 'file' | 'audio' | 'video';
  };
  visitorInfo?: {
    visitorId?: string; // Required for commercial/admin users
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
  };
  metadata?: {
    department?: string;
    priority?: 'LOW' | 'NORMAL' | 'MEDIUM' | 'HIGH' | 'URGENT';
    source?: string;
    initialUrl?: string;
  };
}

export interface SendMessageRequest {
  chatId: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'audio' | 'video';
}

export interface MarkAsReadRequest {
  messageIds: string[];
}

export interface MarkAsReadResponse {
  success: boolean;
  markedCount: number;
}

// Tipos para las respuestas de la API
export interface CreateChatResponse {
  chatId: string;
  status: string;
  queuePosition?: number;
  estimatedWaitTime?: number;
}

export interface SendMessageResponse {
  messageId: string;
  chatId: string;
  senderId: string;
  senderType: string;
  content: string;
  sentAt: string;
  status: string;
}

export interface GetChatsResponse {
  chats: Chat[];
  pagination?: {
    hasNext: boolean;
    cursor?: string;
    total?: number;
  };
}

export interface GetMessagesResponse {
  messages: Message[];
  pagination?: {
    hasNext: boolean;
    cursor?: string;
    total?: number;
  };
}

// Tipos para el endpoint V2 de mensajes con paginación cursor
export interface MessageListResponse {
  messages: Message[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
}

export interface MessagePaginationInfo {
  total: number;
  hasMore: boolean;
  nextCursor?: string;
}

// Tipos para sistema de notificaciones de mensajes no leídos
export interface UnreadMessage extends Message {
  isRead: false; // Solo mensajes no leídos
}

export interface UnreadMessagesResponse {
  messages: Message[];
  total: number;
}

export interface UnreadCountMap {
  [chatId: string]: number;
}

// Tipos para el sistema de pestañas del widget de chat
export interface ChatTab {
  chatId: string;
  title: string;           // Nombre del visitante o asunto
  unreadCount: number;     // Mensajes no leídos
  isActive: boolean;       // Pestaña activa
  lastMessage?: string;    // Preview del último mensaje
  createdAt: Date;
  isPending?: boolean;     // True si es un chat pendiente (sin asignar)
}