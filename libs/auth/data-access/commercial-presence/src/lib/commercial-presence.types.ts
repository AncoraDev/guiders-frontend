/**
 * Tipos y interfaces para el servicio de presencia de comerciales
 */

/**
 * Estados de conexión posibles para un comercial
 * - online: Conectado y disponible para chats
 * - away: Ausente temporalmente
 * - busy: Ocupado, no disponible para nuevos chats
 * - chatting: En conversación activa
 * - offline: Desconectado
 */
export type ConnectionStatus = 'online' | 'away' | 'busy' | 'chatting' | 'offline';

/**
 * Metadata opcional que se puede enviar con las peticiones
 */
export interface CommercialMetadata {
  browser?: string;
  version?: string;
  timezone?: string;
  activeChats?: number;
  action?: string;
  [key: string]: unknown;
}

/**
 * Request para conectar un comercial
 */
export interface ConnectCommercialRequest {
  id: string;
  name: string;
  metadata?: CommercialMetadata;
}

/**
 * Request para desconectar un comercial
 */
export interface DisconnectCommercialRequest {
  id: string;
  /** Motivo de cierre de sesión (persistencia en backend). */
  reason?: 'manual' | 'logout' | 'browser_close' | 'unknown';
}

/**
 * Request para cambiar el estado de un comercial
 */
export interface UpdateStatusRequest {
  id: string;
  status: ConnectionStatus;
}

/**
 * Información del comercial retornada por la API
 */
export interface CommercialInfo {
  id: string;
  name: string;
  connectionStatus: ConnectionStatus;
  lastActivity: string;
  isActive: boolean;
}

/**
 * Response genérica de la API
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  commercial?: T;
  data?: T;
}

/**
 * Response del endpoint de status
 */
export interface CommercialStatusResponse {
  commercialId: string;
  connectionStatus: ConnectionStatus;
  lastActivity: string;
  isActive: boolean;
}
