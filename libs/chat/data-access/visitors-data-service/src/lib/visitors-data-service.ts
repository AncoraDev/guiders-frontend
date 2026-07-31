import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { tap, catchError, switchMap, map } from 'rxjs/operators';
import { ENVIRONMENT_TOKEN } from '@guiders-frontend/auth/data-access/session';
import {
  Visitor,
  GetVisitorResponse,
  GetVisitorSessionsResponse,
  CreateChatWithVisitorRequest,
  CreateChatWithVisitorResponse,
  IdentifyVisitorRequest,
  IdentifyVisitorResponse,
  EndSessionRequest,
  EndSessionResponse,
  VisitorStats,
  Chat,
  GetChatsResponse,
  VisitorSearchRequest,
  VisitorSearchResponse,
  QuickFiltersResponse,
  SavedFiltersResponse,
  SaveFilterRequest,
  SaveFilterResponse,
  SaveContactDataRequest,
  LeadContactData,
  VisitorPageHistory,
  VisitorPageHistoryItem,
} from '@guiders-frontend/shared/types';

export type { VisitorPageHistory, VisitorPageHistoryItem };

export interface LeadScoreSignals {
  isRecurrentVisitor: boolean;
  hasHighEngagement: boolean;
  hasInvestedTime: boolean;
  needsHelp: boolean;
}

export interface LeadScore {
  score: number;
  tier: 'cold' | 'warm' | 'hot';
  signals: LeadScoreSignals;
}

export interface VisitorActivity {
  visitorId: string;
  totalSessions: number;
  totalChats: number;
  totalPagesVisited: number;
  totalTimeConnectedMs: number;
  currentConnectionStatus: 'ONLINE' | 'OFFLINE' | 'AWAY' | 'BUSY' | 'CHATTING';
  lifecycle: 'ANON' | 'ENGAGED' | 'LEAD' | 'CONVERTED';
  lastActivityAt: string;
  currentUrl: string;
  leadScore: LeadScore;
}

@Injectable({
  providedIn: 'root',
})
export class VisitorsDataService {
  private readonly http = inject(HttpClient);
  private readonly environment = inject(ENVIRONMENT_TOKEN);
  private readonly baseUrl = `${this.environment.api.baseUrl}`;

  // Función para obtener el token de acceso
  private getAccessToken(): string | null {
    return localStorage.getItem('access-token');
  }

  // Obtener visitante por ID
  getVisitorById(visitorId: string): Observable<GetVisitorResponse> {
    return this.http.get<GetVisitorResponse>(
      `${this.baseUrl}/visitors/${visitorId}`,
      { withCredentials: true }
    );
  }

  // Obtener página actual del visitante
  getVisitorCurrentPage(visitorId: string): Observable<{
    currentUrl: string;
    updatedAt: string;
  }> {
    return this.http
      .get<{
        currentUrl: string;
        updatedAt: string;
      }>(`${this.baseUrl}/visitors/${visitorId}/current-page`, {
        withCredentials: true,
      })
      .pipe(
        tap((response) =>
          console.log('[VisitorsDataService] Current page:', response)
        ),
        catchError((error) => {
          console.error(
            '[VisitorsDataService] Error getting current page:',
            error
          );
          return throwError(() => error);
        })
      );
  }

  // Obtener actividad del visitante (para carga inicial de detalles)
  getVisitorActivity(visitorId: string): Observable<VisitorActivity> {
    return this.http
      .get<VisitorActivity>(`${this.baseUrl}/visitors/${visitorId}/activity`, {
        withCredentials: true,
      })
      .pipe(
        tap((response) =>
          console.log('[VisitorsDataService] Visitor activity:', response)
        ),
        catchError((error) => {
          console.error(
            '[VisitorsDataService] Error getting visitor activity:',
            error
          );
          return throwError(() => error);
        })
      );
  }

  /** Historial de páginas (PAGE_VIEW), más reciente primero */
  getVisitorPageHistory(
    visitorId: string,
    limit = 50
  ): Observable<VisitorPageHistory> {
    return this.http
      .get<VisitorPageHistory>(
        `${this.baseUrl}/visitors/${visitorId}/page-history`,
        {
          params: { limit: String(limit) },
          withCredentials: true,
        }
      )
      .pipe(
        catchError((error) => {
          console.error(
            '[VisitorsDataService] Error getting page history:',
            error
          );
          return throwError(() => error);
        })
      );
  }

  // Obtener sesiones de un visitante
  getVisitorSessions(
    visitorId: string,
    limit = 10,
    includeActive = true
  ): Observable<GetVisitorSessionsResponse> {
    const params = new HttpParams()
      .set('limit', limit.toString())
      .set('includeActive', includeActive.toString());

    return this.http.get<GetVisitorSessionsResponse>(
      `${this.baseUrl}/visitors/${visitorId}/sessions`,
      { params, withCredentials: true }
    );
  }

  // Obtener chats de un visitante
  getVisitorChats(
    visitorId: string,
    cursor?: string,
    limit = 20
  ): Observable<GetChatsResponse> {
    let params = new HttpParams().set('limit', limit.toString());

    if (cursor) {
      params = params.set('cursor', cursor);
    }

    // Configurar headers de autenticación
    const token = this.getAccessToken();
    const options = token
      ? {
          params,
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        }
      : { params, withCredentials: true };

    return this.http.get<GetChatsResponse>(
      `${this.baseUrl}/v2/chats/visitor/${visitorId}`,
      options
    );
  }

  // Crear chat con visitante (funcionalidad proactiva)
  createChatWithVisitor(
    request: CreateChatWithVisitorRequest
  ): Observable<CreateChatWithVisitorResponse> {
    const visitorInfo = {
      ...(request.visitorInfo ?? {}),
      // Comerciales deben enviar visitorId dentro de visitorInfo (API v2)
      visitorId: request.visitorId,
    };

    if (request.firstMessage) {
      // Usar endpoint que crea chat con mensaje inicial
      return this.http.post<CreateChatWithVisitorResponse>(
        `${this.baseUrl}/v2/chats/with-message`,
        {
          firstMessage: request.firstMessage,
          visitorInfo,
          metadata: request.metadata,
        },
        { withCredentials: true }
      );
    } else {
      // Usar endpoint que solo crea el chat
      return this.http.post<CreateChatWithVisitorResponse>(
        `${this.baseUrl}/v2/chats`,
        {
          visitorInfo,
          metadata: request.metadata,
        },
        { withCredentials: true }
      );
    }
  }

  // Obtener cola de chats pendientes (sin asignar)
  getPendingChats(
    department?: string,
    limit = 50
  ): Observable<{
    queue: Chat[];
    total: number;
    waitTime: { average: number; median: number };
  }> {
    let params = new HttpParams().set('limit', limit.toString());

    if (department) {
      params = params.set('department', department);
    }

    // El backend puede devolver un array plano o un envelope { queue, total, waitTime }
    return this.http
      .get<
        | Chat[]
        | {
            queue: Chat[];
            total: number;
            waitTime: { average: number; median: number };
          }
      >(`${this.baseUrl}/v2/chats/queue/pending`, {
        params,
        withCredentials: true,
      })
      .pipe(
        map((response) => {
          if (Array.isArray(response)) {
            return {
              queue: response,
              total: response.length,
              waitTime: { average: 0, median: 0 },
            };
          }
          return response;
        })
      );
  }

  // Asignar chat a comercial
  assignChatToCommercial(
    chatId: string,
    commercialId: string
  ): Observable<{ success: boolean; assignedAt: string }> {
    return this.http.put<{ success: boolean; assignedAt: string }>(
      `${this.baseUrl}/v2/chats/${chatId}/assign/${commercialId}`,
      {},
      { withCredentials: true }
    );
  }

  /** Transfiere un chat ASSIGNED/ACTIVE a otro comercial conectado. */
  transferChat(chatId: string, commercialId: string): Observable<unknown> {
    return this.http.put(
      `${this.baseUrl}/v2/chats/${chatId}/transfer/${commercialId}`,
      {},
      { withCredentials: true }
    );
  }

  // Identificar visitante (para tracking)
  identifyVisitor(
    request: IdentifyVisitorRequest
  ): Observable<IdentifyVisitorResponse> {
    return this.http.post<IdentifyVisitorResponse>(
      `${this.baseUrl}/visitors/identify`,
      request,
      { withCredentials: true }
    );
  }

  // Terminar sesión de visitante
  endSession(request: EndSessionRequest): Observable<EndSessionResponse> {
    return this.http.post<EndSessionResponse>(
      `${this.baseUrl}/visitors/session/end`,
      request,
      { withCredentials: true }
    );
  }

  // Obtener intenciones del visitante
  getVisitorIntents(visitorId: string): Observable<{
    visitorId: string;
    intents: Array<{
      category: string;
      confidence: number;
      description?: string;
    }>;
    summary: {
      totalIntents: number;
      highestConfidence: number;
      dominantCategory: string;
    };
  }> {
    return this.http.get<{
      visitorId: string;
      intents: Array<{
        category: string;
        confidence: number;
        description?: string;
      }>;
      summary: {
        totalIntents: number;
        highestConfidence: number;
        dominantCategory: string;
      };
    }>(`${this.baseUrl}/tracking/intent/${visitorId}`, {
      withCredentials: true,
    });
  }

  // Obtener tags de intención del visitante
  getVisitorIntentTags(visitorId: string): Observable<{
    tags: Array<{
      name: string;
      category: string;
      confidence: number;
    }>;
    categories: Record<string, number>;
    visitor: Visitor;
  }> {
    return this.http.get<{
      tags: Array<{
        name: string;
        category: string;
        confidence: number;
      }>;
      categories: Record<string, number>;
      visitor: Visitor;
    }>(`${this.baseUrl}/tracking/intent-tags/${visitorId}`, {
      withCredentials: true,
    });
  }

  // Obtener estadísticas de visitantes usando tenant-visitors endpoint
  getVisitorStats(companyId: string): Observable<VisitorStats> {
    return this.http.get<VisitorStats>(
      `${this.baseUrl}/tenant-visitors/${companyId}/visitors/stats`,
      { withCredentials: true }
    );
  }

  // Obtener información de la empresa del usuario autenticado
  getCompanySites(): Observable<{
    sites: Array<{
      siteId: string;
      companyId: string;
      siteName: string;
      domain: string;
      isActive: boolean;
    }>;
    siteId: string;
    companyId: string;
    companyName: string;
    totalSites: number;
  }> {
    console.log(
      '[VisitorsDataService] Obteniendo información de la empresa del usuario autenticado'
    );

    // Usar el endpoint /api/me/company que requiere autenticación (cookies BFF)
    return this.http
      .get<{
        id: string;
        companyName: string;
        domains: string[];
        siteId: string;
        siteName: string;
      }>(`${this.baseUrl}/me/company`, {
        withCredentials: true, // Requiere autenticación via cookies BFF
      })
      .pipe(
        switchMap((companyInfo) => {
          console.log(
            '[VisitorsDataService] Información de empresa obtenida:',
            companyInfo
          );

          // Transformar la respuesta de /me/company al formato esperado
          // Usar el siteId real del backend, no el companyId
          const sites = companyInfo.domains.map((domain) => ({
            siteId: companyInfo.siteId, // Usar el siteId real
            companyId: companyInfo.id, // El id es el companyId
            siteName: companyInfo.siteName || domain,
            domain: domain,
            isActive: true, // Asumir que todos los dominios están activos
          }));

          return new Observable<{
            sites: Array<{
              siteId: string;
              companyId: string;
              siteName: string;
              domain: string;
              isActive: boolean;
            }>;
            siteId: string;
            companyId: string;
            companyName: string;
            totalSites: number;
          }>((subscriber) => {
            subscriber.next({
              sites: sites,
              siteId: companyInfo.siteId,
              companyId: companyInfo.id,
              companyName: companyInfo.companyName,
              totalSites: sites.length,
            });
            subscriber.complete();
          });
        }),
        tap((response) => {
          console.log('[VisitorsDataService] Sitios procesados:', response);
        }),
        catchError((error) => {
          console.error(
            '[VisitorsDataService] Error al obtener información de la empresa:',
            {
              status: error.status,
              statusText: error.statusText,
              message: error.message,
              url: error.url,
            }
          );
          return throwError(() => error);
        })
      );
  }

  // ============================================
  // Métodos para Sistema de Filtros Complejos
  // ============================================

  /**
   * Buscar visitantes con filtros complejos
   * POST /tenant-visitors/:tenantId/visitors/search
   */
  searchVisitors(
    tenantId: string,
    request: VisitorSearchRequest = {}
  ): Observable<VisitorSearchResponse> {
    console.log(
      `[VisitorsDataService] Searching visitors with filters:`,
      request
    );

    return this.http
      .post<VisitorSearchResponse>(
        `${this.baseUrl}/tenant-visitors/${tenantId}/visitors/search`,
        request,
        { withCredentials: true }
      )
      .pipe(
        tap((response) =>
          console.log('[VisitorsDataService] Search response:', response)
        ),
        catchError((error) => {
          console.error(
            '[VisitorsDataService] Error searching visitors:',
            error
          );
          return throwError(() => error);
        })
      );
  }

  /**
   * Obtener filtros rápidos disponibles con contadores
   * GET /tenant-visitors/:tenantId/visitors/filters/quick
   */
  getQuickFilters(tenantId: string): Observable<QuickFiltersResponse> {
    console.log(
      `[VisitorsDataService] Getting quick filters for tenant: ${tenantId}`
    );

    return this.http
      .get<QuickFiltersResponse>(
        `${this.baseUrl}/tenant-visitors/${tenantId}/visitors/filters/quick`,
        { withCredentials: true }
      )
      .pipe(
        tap((response) =>
          console.log('[VisitorsDataService] Quick filters:', response)
        ),
        catchError((error) => {
          console.error(
            '[VisitorsDataService] Error getting quick filters:',
            error
          );
          return throwError(() => error);
        })
      );
  }

  /**
   * Obtener filtros guardados del usuario
   * GET /tenant-visitors/:tenantId/visitors/filters/saved
   */
  getSavedFilters(tenantId: string): Observable<SavedFiltersResponse> {
    console.log(
      `[VisitorsDataService] Getting saved filters for tenant: ${tenantId}`
    );

    return this.http
      .get<SavedFiltersResponse>(
        `${this.baseUrl}/tenant-visitors/${tenantId}/visitors/filters/saved`,
        { withCredentials: true }
      )
      .pipe(
        tap((response) =>
          console.log('[VisitorsDataService] Saved filters:', response)
        ),
        catchError((error) => {
          console.error(
            '[VisitorsDataService] Error getting saved filters:',
            error
          );
          return throwError(() => error);
        })
      );
  }

  /**
   * Guardar un filtro personalizado
   * POST /tenant-visitors/:tenantId/visitors/filters/saved
   * Límite: máximo 20 filtros por usuario
   */
  saveFilter(
    tenantId: string,
    filter: SaveFilterRequest
  ): Observable<SaveFilterResponse> {
    console.log(`[VisitorsDataService] Saving filter:`, filter);

    return this.http
      .post<SaveFilterResponse>(
        `${this.baseUrl}/tenant-visitors/${tenantId}/visitors/filters/saved`,
        filter,
        { withCredentials: true }
      )
      .pipe(
        tap((response) =>
          console.log('[VisitorsDataService] Filter saved:', response)
        ),
        catchError((error) => {
          console.error('[VisitorsDataService] Error saving filter:', error);
          return throwError(() => error);
        })
      );
  }

  /**
   * Eliminar un filtro guardado
   * DELETE /tenant-visitors/:tenantId/visitors/filters/saved/:filterId
   */
  deleteFilter(tenantId: string, filterId: string): Observable<void> {
    console.log(`[VisitorsDataService] Deleting filter: ${filterId}`);

    return this.http
      .delete<void>(
        `${this.baseUrl}/tenant-visitors/${tenantId}/visitors/filters/saved/${filterId}`,
        { withCredentials: true }
      )
      .pipe(
        tap(() => console.log('[VisitorsDataService] Filter deleted')),
        catchError((error) => {
          console.error('[VisitorsDataService] Error deleting filter:', error);
          return throwError(() => error);
        })
      );
  }

  // ============================================
  // Métodos para Gestión de Datos de Contacto (Leads)
  // ============================================

  /**
   * Guardar datos de contacto de un visitante (lead)
   * POST /leads/contact-data/:visitorId
   *
   * Permite a comerciales guardar información de contacto del visitante
   * como nombre, email, teléfono, etc. También soporta datos adicionales
   * personalizados según el sector (vehiculo, inmueble, etc.)
   *
   * NOTA: visitorId va en la URL, NO en el body del request
   *
   * @param visitorId - ID del visitante (va en la URL)
   * @param request - Datos de contacto a guardar (sin visitorId)
   * @returns Observable con los datos de contacto guardados
   */
  saveContactData(
    visitorId: string,
    request: SaveContactDataRequest
  ): Observable<LeadContactData> {
    console.log('[VisitorsDataService] Guardando datos de contacto:', {
      visitorId,
      request,
    });

    return this.http
      .post<LeadContactData>(
        `${this.baseUrl}/leads/contact-data/${visitorId}`,
        request,
        { withCredentials: true }
      )
      .pipe(
        tap((response) => {
          console.log(
            '[VisitorsDataService] Datos de contacto guardados:',
            response
          );
        }),
        catchError((error) => {
          console.error(
            '[VisitorsDataService] Error guardando datos de contacto:',
            {
              visitorId: visitorId,
              status: error.status,
              statusText: error.statusText,
              message: error.message,
            }
          );
          return throwError(() => error);
        })
      );
  }

  /**
   * Obtener datos de contacto de un visitante
   * GET /leads/contact-data/:visitorId
   *
   * @param visitorId - ID del visitante
   * @returns Observable con los datos de contacto del visitante o null si no existen
   */
  getContactData(visitorId: string): Observable<LeadContactData | null> {
    console.log(
      '[VisitorsDataService] Obteniendo datos de contacto para:',
      visitorId
    );

    return this.http
      .get<LeadContactData>(`${this.baseUrl}/leads/contact-data/${visitorId}`, {
        withCredentials: true,
      })
      .pipe(
        tap((response) => {
          console.log(
            '[VisitorsDataService] Datos de contacto obtenidos:',
            response
          );
        }),
        catchError((error) => {
          if (error.status === 404) {
            console.log(
              '[VisitorsDataService] No hay datos de contacto para el visitante'
            );
            return new Observable<LeadContactData | null>((subscriber) => {
              subscriber.next(null);
              subscriber.complete();
            });
          }
          console.error(
            '[VisitorsDataService] Error obteniendo datos de contacto:',
            {
              visitorId,
              status: error.status,
              message: error.message,
            }
          );
          return throwError(() => error);
        })
      );
  }
}
