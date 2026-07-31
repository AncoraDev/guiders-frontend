// Tipos principales para la integración de leads y CRM

// Datos de contacto del lead
export interface LeadContactData {
  id: string;
  visitorId: string;
  companyId: string;
  /** Alias interno para identificar al visitante en consola */
  alias?: string;
  // Campos principales (mapean a LeadCars)
  nombre?: string;
  apellidos?: string;
  email?: string;
  telefono?: string; // Teléfono principal, formato E.164
  movil?: string; // Teléfono móvil adicional, formato E.164
  // Datos de ubicación
  dni?: string;
  cp?: string; // Código postal
  provincia?: string;
  poblacion?: string;
  // Campos adicionales
  additionalData?: Record<string, unknown>;
  extractedFromChatId?: string;
  extractedAt: string;
  updatedAt: string;
}

// Request para guardar datos de contacto
// NOTA: visitorId va en la URL del endpoint, NO en el body
export interface SaveContactDataRequest {
  alias?: string;
  nombre?: string;
  apellidos?: string;
  email?: string;
  telefono?: string; // Formato E.164: +34XXXXXXXXX
  movil?: string; // Formato E.164: +34XXXXXXXXX
  dni?: string;
  cp?: string;
  provincia?: string;
  poblacion?: string;
  additionalData?: Record<string, unknown>;
  extractedFromChatId?: string;
}

// Configuración de la integración LeadCars por empresa
export interface LeadCarsCompanyConfig {
  id: string;
  companyId: string;
  crmType: 'leadcars';
  enabled: boolean;
  syncChatConversations: boolean;
  triggerEvents: string[];
  config: LeadCarsConfig | Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// Temperaturas de lead disponibles en LeadCars
export type LeadTemperature = 'cold' | 'warm' | 'hot';

export const LEAD_TEMPERATURES: { value: LeadTemperature; label: string }[] = [
  { value: 'cold', label: 'Frío' },
  { value: 'warm', label: 'Templado' },
  { value: 'hot', label: 'Caliente' },
];

// Tipos de lead por defecto en LeadCars
export type LeadType =
  | 'COMPRA'
  | 'VENTA'
  | 'FINANCIACION'
  | 'TALLER'
  | 'RECAMBIOS'
  | 'OTRO';

export const LEAD_TYPES: { value: LeadType; label: string }[] = [
  { value: 'COMPRA', label: 'Compra' },
  { value: 'VENTA', label: 'Venta' },
  { value: 'FINANCIACION', label: 'Financiación' },
  { value: 'TALLER', label: 'Taller' },
  { value: 'RECAMBIOS', label: 'Recambios' },
  { value: 'OTRO', label: 'Otro' },
];

// Estado del lead para LeadCars
export interface LeadCarsEstado {
  id: string;
  motivos?: string[];
  texto?: string;
}

// Configuración específica de LeadCars
export interface LeadCarsConfig {
  // Autenticación (requerido)
  clienteToken: string;

  // Concesionario (requerido, ≥1)
  concesionarioId: number;

  // Entorno
  useSandbox?: boolean;

  // IDs opcionales
  sedeId?: number;
  campanaId?: number;

  // Tipo de lead por defecto (ID numérico de GET /tipos)
  tipoLeadDefault?: number;
}

// Request para crear/actualizar configuración LeadCars
export interface CreateLeadCarsConfigRequest {
  companyId: string;
  crmType: 'leadcars';
  enabled: boolean;
  syncChatConversations: boolean;
  triggerEvents: string[];
  config: Record<string, unknown>;
}

// Estados de sincronización
export type SyncStatus = 'pending' | 'synced' | 'failed' | 'partial';

// Contact data embedded en los sync records (devuelto por el backend via ContactDataDto)
export interface LeadCarsSyncRecordContactData {
  alias?: string;
  nombre?: string;
  apellidos?: string;
  email?: string;
  telefono?: string;
  dni?: string;
  poblacion?: string;
  additionalData?: Record<string, unknown>;
}

// Registro de sincronización con LeadCars
export interface LeadCarsSyncRecord {
  id: string;
  visitorId: string;
  companyId: string;
  crmType: 'leadcars';
  externalLeadId?: string;
  status: SyncStatus;
  lastSyncAt?: string;
  lastError?: string;
  retryCount: number;
  chatsSynced: string[];
  contactData?: LeadCarsSyncRecordContactData;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// Respuesta de test de conexión
export interface TestConnectionResponse {
  success: boolean;
  message: string;
}

// Valores por defecto para LeadCars
export const LEADCARS_CONFIG_DEFAULTS: Partial<LeadCarsConfig> = {
  useSandbox: false,
};

// URLs de la API de LeadCars
export const LEADCARS_API_URLS = {
  production: 'https://api.leadcars.es/api/v2',
  sandbox: 'https://apisandbox.leadcars.es/api/v2',
} as const;

// Mapeo de campos entre Guiders y LeadCars API
export interface LeadCarsLeadPayload {
  // Campos requeridos
  nombre: string;
  apellidos?: string;
  telefono: string; // Formato E.164: +34915715135
  concesionario: number;
  tipo_lead: number;

  // Campos opcionales
  movil?: string; // Formato E.164
  email?: string;
  cp?: string;
  provincia?: string;
  comentario?: string;
  url_origen?: string;
  sede?: number;
  campana?: string;
  custom?: Record<string, string | number | boolean>;
  estado?: LeadCarsEstado;
  temperature?: LeadTemperature;
}

// Eventos de trigger disponibles
export const AVAILABLE_TRIGGER_EVENTS = [
  'lifecycle_to_lead',
  'chat_closed',
  'contact_data_updated',
] as const;

export type TriggerEvent = (typeof AVAILABLE_TRIGGER_EVENTS)[number];

// ============================================
// Tipos para endpoints de LeadCars API
// ============================================

// Concesionario de LeadCars (GET /concesionarios)
export interface LeadCarsConcesionario {
  id: number;
  nombre: string;
}

// Sede de LeadCars (GET /sedes/:concesionario)
export interface LeadCarsSede {
  id: number;
  nombre: string;
  concesionarioId: number;
}

// Campaña de LeadCars (GET /campanas/:concesionario)
export interface LeadCarsCampana {
  id: number;
  nombre: string;
  codigo: string;
  concesionarioId: number;
}

// Tipo de lead de LeadCars (GET /tipos)
export interface LeadCarsTipoLead {
  id: number;
  nombre: string;
}

// Estado de lead de LeadCars (GET /listStates)
export interface LeadCarsEstadoField {
  name: string;
  type: 'checkbox' | 'text' | 'textarea';
  title: string;
  required: boolean;
  options?: string[];
}

export interface LeadCarsEstadoConfig {
  id: number;
  group: string;
  fields: LeadCarsEstadoField[];
}

// Respuestas de la API de LeadCars
export interface LeadCarsListStatesResponse {
  [estadoName: string]: LeadCarsEstadoConfig;
}
