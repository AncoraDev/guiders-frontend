// Enums y tipos para visitantes
export type VisitorLifecycle = 'ANON' | 'ENGAGED' | 'LEAD' | 'CONVERTED';
export type VisitorStatus = 'online' | 'offline' | 'idle';
export type SessionStatus = 'active' | 'inactive' | 'ended';
export type ConnectionStatus = 'online' | 'offline' | 'away' | 'chatting' | 'busy';

// Enums para filtros de búsqueda (API)
export type VisitorLifecycleFilter = 'ANON' | 'ENGAGED' | 'LEAD' | 'CONVERTED';
export type VisitorConnectionStatusFilter = 'online' | 'away' | 'chatting' | 'offline';
export type VisitorSortField = 'createdAt' | 'updatedAt' | 'lastActivity' | 'lifecycle' | 'connectionStatus';
export type SortDirection = 'ASC' | 'DESC';

// Interface principal para visitante
export interface Visitor {
  id: string;
  fingerprint?: string;
  sessionId?: string;
  lifecycle: VisitorLifecycle;
  isNewVisitor: boolean;
  
  // Información personal (opcional)
  name?: string;
  email?: string;
  phone?: string;
  
  // Información de sesión
  status: VisitorStatus;
  connectionStatus?: ConnectionStatus; // Estado de conexión en tiempo real (WebSocket)
  currentUrl?: string;
  domain: string;
  siteId: string;
  companyId: string;
  
  // Metadata de tracking
  userAgent?: string;
  ipAddress?: string;
  country?: string;
  city?: string;
  referrer?: string;
  source?: string;
  
  // Información de intenciones
  intents?: VisitorIntent[];
  tags?: VisitorTag[];
  
  // Timestamps
  firstVisit: Date;
  lastVisit: Date;
  currentSessionStart?: Date;
  
  // Estadísticas
  totalSessions: number;
  totalPageViews: number;
  averageSessionDuration: number;
  totalSessionDuration?: number; // Duración total de sesiones en milisegundos
  
  // Estado de chat
  hasActiveChat: boolean;
  lastChatId?: string;
  totalChats: number;
  pendingChatIds?: string[]; // IDs de chats pendientes
  
  // Para UI
  isSelected?: boolean;
  isMe?: boolean; // Indica si este visitante es el propio usuario
  isInternal?: boolean; // Indica si este visitante es un usuario interno (empleado, admin, etc.)
}

// Interface para sesión de visitante
export interface VisitorSession {
  id: string;
  visitorId: string;
  status: SessionStatus;
  startTime: Date;
  endTime?: Date;
  duration?: number; // en segundos
  
  // Información de la sesión
  pages: PageView[];
  events: VisitorEvent[];
  
  // Metadata
  userAgent: string;
  ipAddress: string;
  referrer?: string;
  
  // Estadísticas
  pageViews: number;
  timeOnSite: number; // en segundos
  bounceRate?: number;
}

// Interface para página vista
export interface PageView {
  id: string;
  sessionId: string;
  url: string;
  title?: string;
  timestamp: Date;
  timeOnPage?: number; // en segundos
  exitPage?: boolean;
}

// Interface para eventos de visitante
export interface VisitorEvent {
  id: string;
  sessionId: string;
  type: 'click' | 'scroll' | 'form_submit' | 'download' | 'exit_intent' | 'custom';
  category: string;
  action: string;
  label?: string;
  value?: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// Interface para intenciones de visitante
export interface VisitorIntent {
  id: string;
  visitorId: string;
  category: string;
  subcategory?: string;
  confidence: number; // 0-1
  description?: string;
  detectedAt: Date;
  source: 'behavior' | 'explicit' | 'ai_analysis';
}

// Interface para tags de visitante
export interface VisitorTag {
  id: string;
  name: string;
  category: string;
  confidence?: number;
  addedAt: Date;
  addedBy?: 'system' | 'commercial' | 'ai';
}

// Tipos para filtros de visitantes
export interface VisitorFilters {
  status?: VisitorStatus[];
  lifecycle?: VisitorLifecycle[];
  hasActiveChat?: boolean;
  hasPendingChats?: boolean;
  siteId?: string;
  includeOffline?: boolean;
  department?: string;
  tags?: string[];
  dateRange?: {
    from: Date;
    to: Date;
  };
  search?: string;
}

// Tipos para ordenamiento
export interface VisitorSort {
  field: 'lastVisit' | 'firstVisit' | 'name' | 'totalChats' | 'lifecycle' | 'status';
  direction: 'asc' | 'desc';
}

// Tipos para paginación
export interface VisitorPagination {
  limit: number;
  offset?: number;
  cursor?: string;
  totalCount?: number; // Total de registros disponibles
  currentPage?: number; // Página actual (calculada desde offset)
}

// Respuestas de la API
export interface GetVisitorsResponse {
  visitors: Visitor[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
}

// Tipo para visitante en el contexto de tenant-visitors
export interface TenantVisitor {
  id: string;
  fingerprint: string;
  connectionStatus: "ONLINE" | "OFFLINE" | "AWAY" | "CHATTING" | "BUSY";
  siteId: string;
  siteName: string;
  currentUrl?: string; // URL actual donde está navegando el visitante
  createdAt: string;
  lastActivity: string;
  pendingChatIds: string[];
  totalChatsCount: number; // Total de chats del visitante
}

// Respuesta del endpoint tenant-visitors (usando companyId)
export interface GetTenantVisitorsResponse {
  companyId: string;
  companyName: string;
  visitors: TenantVisitor[];
  totalCount: number;
  activeSitesCount: number;
  timestamp: string;
}

export interface GetVisitorResponse {
  visitor: Visitor;
  sessions: VisitorSession[];
  currentSession?: VisitorSession;
}

export interface GetVisitorSessionsResponse {
  sessions: VisitorSession[];
  total: number;
  activeSession?: VisitorSession;
}

export interface IdentifyVisitorRequest {
  fingerprint: string;
  domain: string;
  apiKey: string;
  currentUrl?: string;
}

export interface IdentifyVisitorResponse {
  visitorId: string;
  sessionId: string;
  lifecycle: VisitorLifecycle;
  isNewVisitor: boolean;
}

export interface EndSessionRequest {
  sessionId?: string;
  visitorId?: string;
  reason?: string;
}

export interface EndSessionResponse {
  success: boolean;
  message: string;
}

// Tipos para crear chat con visitante
export interface CreateChatWithVisitorRequest {
  visitorId: string;
  firstMessage?: {
    content: string;
    type?: 'TEXT' | 'IMAGE' | 'FILE';
  };
  visitorInfo?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  metadata?: {
    department?: string;
    source?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  };
}

export interface CreateChatWithVisitorResponse {
  chatId: string;
  messageId?: string;
  position: number;
}

// Tipos para estadísticas de visitantes
export interface VisitorStats {
  totalVisitors: number;
  onlineVisitors: number;
  newVisitors: number;
  returningVisitors: number;
  withPendingChats: number;
  averageSessionDuration: number;
  bounceRate: number;
  conversionRate: number;
  topPages: Array<{
    url: string;
    title?: string;
    views: number;
  }>;
  topSources: Array<{
    source: string;
    visitors: number;
  }>;
}

// Interface para el estado del componente de visitantes
export interface VisitorState {
  visitors: Visitor[];
  selectedVisitor: Visitor | null;
  filters: VisitorFilters;
  sort: VisitorSort;
  pagination: VisitorPagination;
  loading: boolean;
  error: string | null;
  stats: VisitorStats | null;
  searchQuery: string;
}

// ============================================
// Tipos para Sistema de Filtros Complejos
// ============================================

// Filtros de búsqueda avanzada (POST /search)
export interface VisitorSearchFilters {
  lifecycle?: VisitorLifecycleFilter[];
  connectionStatus?: VisitorConnectionStatusFilter[];
  hasAcceptedPrivacyPolicy?: boolean;
  hasPendingChats?: boolean; // Filtrar por chats pendientes (sin asignar)
  createdFrom?: string; // ISO 8601
  createdTo?: string; // ISO 8601
  lastActivityFrom?: string; // ISO 8601
  lastActivityTo?: string; // ISO 8601
  siteIds?: string[];
  currentUrlContains?: string;
  hasActiveSessions?: boolean;
  minTotalSessionsCount?: number; // Filtrar por número mínimo de sesiones
  maxTotalSessionsCount?: number; // Filtrar por número máximo de sesiones
  ipAddress?: string; // Filtrar por dirección IP exacta
  isInternal?: boolean; // Filtrar por visitantes internos
}

// Ordenamiento para búsqueda
export interface VisitorSearchSort {
  field: VisitorSortField;
  direction: SortDirection;
}

// Request para búsqueda con filtros complejos
export interface VisitorSearchRequest {
  filters?: VisitorSearchFilters;
  sort?: VisitorSearchSort;
  page?: number;
  limit?: number;
}

// Visitante en respuesta de búsqueda
export interface VisitorSearchResult {
  id: string;
  tenantId: string;
  siteId: string;
  fingerprint?: string;
  lifecycle: VisitorLifecycleFilter;
  connectionStatus: VisitorConnectionStatusFilter;
  hasAcceptedPrivacyPolicy: boolean;
  currentUrl?: string;
  createdAt: string;
  updatedAt: string;
  activeSessionsCount: number;
  totalSessionsCount: number;
  totalSessionDuration: number; // Duración total de sesiones en milisegundos
  totalChatsCount: number; // Total de chats del visitante
  pendingChatIds?: string[]; // IDs de chats pendientes de asignar
  lastIpAddress?: string; // Última dirección IP del visitante
  lastUserAgent?: string; // Último user agent del visitante
  isMe?: boolean; // Indica si este visitante es el propio usuario
  isInternal?: boolean; // Indica si este visitante es un usuario interno (empleado, admin, etc.)
  // Contact enrichment fields — only present when the backend enriches from contact profile.
  // Not guaranteed by the search endpoint; treat as optional.
  name?: string;
  email?: string;
  domain?: string;
}

// Paginación de búsqueda
export interface VisitorSearchPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// Response de búsqueda con filtros complejos
export interface VisitorSearchResponse {
  visitors: VisitorSearchResult[];
  pagination: VisitorSearchPagination;
  appliedFilters?: Record<string, unknown>;
}

// Filtro rápido (Quick Filter)
export interface QuickFilter {
  id: string;
  label: string;
  count: number;
  isActive: boolean;
}

// Response de filtros rápidos
export interface QuickFiltersResponse {
  filters: QuickFilter[];
}

// Filtro guardado (Saved Filter)
export interface SavedFilter {
  id: string;
  name: string;
  description?: string;
  filters: VisitorSearchFilters;
  sort?: VisitorSearchSort;
  userId: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

// Response de filtros guardados
export interface SavedFiltersResponse {
  filters: SavedFilter[];
  total: number;
}

// Request para guardar filtro
export interface SaveFilterRequest {
  name: string;
  description?: string;
  filters: VisitorSearchFilters;
  sort?: VisitorSearchSort;
}

// Response al guardar filtro
export interface SaveFilterResponse {
  id: string;
}

// Estado de filtros activos (para UI)
export interface ActiveFiltersState {
  quickFilterId?: string;
  savedFilterId?: string;
  customFilters?: VisitorSearchFilters;
  sort?: VisitorSearchSort;
}

/** Entrada del historial de navegación (PAGE_VIEW) */
export interface VisitorPageHistoryItem {
  url: string;
  path?: string;
  title?: string;
  occurredAt: string;
  index: number;
}

/** Respuesta de historial de páginas del visitante */
export interface VisitorPageHistory {
  visitorId: string;
  total: number;
  pages: VisitorPageHistoryItem[];
}