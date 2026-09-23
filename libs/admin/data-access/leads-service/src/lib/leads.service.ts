import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, catchError, of, tap, throwError, map } from 'rxjs';
import { ENVIRONMENT_TOKEN } from '@guiders-frontend/auth/data-access/session';
import {
  LeadCarsCompanyConfig,
  LeadCarsSyncRecord,
  CreateLeadCarsConfigRequest,
  TestConnectionResponse,
  SendTestLeadRequest,
  SendTestLeadResponse,
  LeadCarsConcesionario,
  LeadCarsSede,
  LeadCarsCampana,
  LeadCarsTipoLead,
} from '@guiders-frontend/shared/types';

@Injectable({
  providedIn: 'root',
})
export class LeadsService {
  private readonly http = inject(HttpClient);
  private readonly environment = inject(ENVIRONMENT_TOKEN);
  private readonly baseUrl = `${this.environment.api.baseUrl}/v1/leads/admin`;

  // BehaviorSubjects para estado reactivo
  private readonly configSubject =
    new BehaviorSubject<LeadCarsCompanyConfig | null>(null);
  private readonly loadingSubject = new BehaviorSubject<boolean>(false);
  private readonly savingSubject = new BehaviorSubject<boolean>(false);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private readonly syncRecordsSubject = new BehaviorSubject<
    LeadCarsSyncRecord[]
  >([]);
  private readonly supportedCrmTypesSubject = new BehaviorSubject<'leadcars'[]>(
    []
  );

  // BehaviorSubjects para datos de LeadCars
  private readonly concesionariosSubject = new BehaviorSubject<
    LeadCarsConcesionario[]
  >([]);
  private readonly sedesSubject = new BehaviorSubject<LeadCarsSede[]>([]);
  private readonly campanasSubject = new BehaviorSubject<LeadCarsCampana[]>([]);
  private readonly tiposLeadSubject = new BehaviorSubject<LeadCarsTipoLead[]>(
    []
  );

  // Observables publicos
  readonly config$ = this.configSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly saving$ = this.savingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();
  readonly syncRecords$ = this.syncRecordsSubject.asObservable();
  readonly supportedCrmTypes$ = this.supportedCrmTypesSubject.asObservable();

  // Observables de LeadCars
  readonly concesionarios$ = this.concesionariosSubject.asObservable();
  readonly sedes$ = this.sedesSubject.asObservable();
  readonly campanas$ = this.campanasSubject.asObservable();
  readonly tiposLead$ = this.tiposLeadSubject.asObservable();

  private getHttpOptions(): { headers: HttpHeaders; withCredentials: boolean } {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });

    const token = localStorage.getItem('access-token');
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    return {
      headers,
      withCredentials: true,
    };
  }

  /**
   * Obtener tipos de CRM soportados
   * GET /api/v1/leads/admin/supported-crms
   */
  getSupportedCrmTypes(): Observable<'leadcars'[]> {
    return this.http
      .get<'leadcars'[]>(
        `${this.baseUrl}/supported-crms`,
        this.getHttpOptions()
      )
      .pipe(
        tap((types) => this.supportedCrmTypesSubject.next(types)),
        catchError((error) => {
          console.error('Error al obtener tipos de CRM:', error);
          return of([]);
        })
      );
  }

  /**
   * Obtener configuracion de LeadCars para la empresa
   * GET /api/v1/leads/admin/config
   */
  getConfig(): Observable<LeadCarsCompanyConfig | null> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    return this.http
      .get<LeadCarsCompanyConfig>(
        `${this.baseUrl}/config`,
        this.getHttpOptions()
      )
      .pipe(
        tap((config) => {
          this.configSubject.next(config);
          this.loadingSubject.next(false);
        }),
        catchError((error) => {
          // Si no existe configuracion, devolver null (estado valido: empresa sin CRM configurado)
          if (error.status === 404) {
            this.configSubject.next(null);
            this.loadingSubject.next(false);
            return of(null);
          }

          console.error('Error al obtener configuracion LeadCars:', error);
          this.errorSubject.next(
            'Error al cargar la configuracion de LeadCars'
          );
          this.loadingSubject.next(false);
          throw error;
        })
      );
  }

  /**
   * Crear o actualizar configuracion de LeadCars.
   * POST /api/v1/leads/admin/config — alta
   * PUT /api/v1/leads/admin/config/:id — edición
   */
  saveConfig(
    request: CreateLeadCarsConfigRequest,
    configId?: string | null,
  ): Observable<LeadCarsCompanyConfig> {
    this.savingSubject.next(true);
    this.errorSubject.next(null);

    const request$ = configId
      ? this.http.put<LeadCarsCompanyConfig>(
          `${this.baseUrl}/config/${configId}`,
          {
            enabled: request.enabled,
            syncChatConversations: request.syncChatConversations,
            triggerEvents: request.triggerEvents,
            config: request.config,
          },
          this.getHttpOptions(),
        )
      : this.http.post<LeadCarsCompanyConfig>(
          `${this.baseUrl}/config`,
          request,
          this.getHttpOptions(),
        );

    return request$.pipe(
      tap((config) => {
        this.configSubject.next(config);
        this.savingSubject.next(false);
      }),
      catchError((error) => {
        console.error('Error al guardar configuracion LeadCars:', error);
        this.errorSubject.next('Error al guardar la configuracion');
        this.savingSubject.next(false);
        throw error;
      }),
    );
  }

  /**
   * Probar conexion con el CRM
   * POST /api/v1/leads/admin/config/:configId/test
   */
  testConnection(configId: string): Observable<TestConnectionResponse> {
    return this.http
      .post<TestConnectionResponse>(
        `${this.baseUrl}/config/${configId}/test`,
        {},
        this.getHttpOptions()
      );
  }

  /**
   * Probar conexión con el token del formulario (aún sin config guardada).
   * POST /api/v1/leads/admin/test-connection
   */
  testConnectionWithCredentials(params: {
    clienteToken: string;
    useSandbox?: boolean;
  }): Observable<TestConnectionResponse> {
    return this.http
      .post<{
        success: boolean;
        error?: string;
        validationErrors?: string[];
      }>(
        `${this.baseUrl}/test-connection`,
        {
          crmType: 'leadcars',
          config: {
            clienteToken: params.clienteToken,
            useSandbox: !!params.useSandbox,
            concesionarioId: 1,
            tipoLeadDefault: 1,
          },
        },
        this.getHttpOptions()
      )
      .pipe(
        map((response) => ({
          success: response.success,
          message:
            response.error ||
            response.validationErrors?.join('; ') ||
            (response.success
              ? 'Conexión con LeadCars establecida correctamente'
              : 'No se pudo establecer conexión con LeadCars'),
        }))
      );
  }

  /**
   * Enviar un lead de prueba a LeadCars.
   * POST /api/v1/leads/admin/leadcars/test-lead
   */
  sendTestLead(payload: SendTestLeadRequest): Observable<SendTestLeadResponse> {
    return this.http.post<SendTestLeadResponse>(
      `${this.baseUrl}/leadcars/test-lead`,
      payload,
      this.getHttpOptions(),
    );
  }

  /**
   * Eliminar configuracion de CRM
   * DELETE /api/v1/leads/admin/config/:configId
   */
  deleteConfig(configId: string): Observable<void> {
    this.savingSubject.next(true);
    this.errorSubject.next(null);

    return this.http
      .delete<void>(`${this.baseUrl}/config/${configId}`, this.getHttpOptions())
      .pipe(
        tap(() => {
          this.configSubject.next(null);
          this.savingSubject.next(false);
        }),
        catchError((error) => {
          console.error('Error al eliminar configuracion CRM:', error);
          this.errorSubject.next('Error al eliminar la configuracion');
          this.savingSubject.next(false);
          throw error;
        })
      );
  }

  /**
   * Obtener registros de sincronizacion
   * GET /api/v1/leads/admin/sync-records
   */
  getSyncRecords(
    onlyFailed = false
  ): Observable<LeadCarsSyncRecord[]> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    const endpoint = onlyFailed
      ? `${this.baseUrl}/sync-records/failed`
      : `${this.baseUrl}/sync-records`;

    return this.http
      .get<LeadCarsSyncRecord[]>(endpoint, this.getHttpOptions())
      .pipe(
        tap((records) => {
          this.syncRecordsSubject.next(records);
          this.loadingSubject.next(false);
        }),
        catchError((error) => {
          console.error('Error al obtener registros de sincronizacion:', error);
          this.errorSubject.next(
            'Error al cargar los registros de sincronizacion'
          );
          this.loadingSubject.next(false);
          return of([]);
        })
      );
  }

  /**
   * Obtener configuracion actual del cache
   */
  getCurrentConfig(): LeadCarsCompanyConfig | null {
    return this.configSubject.value;
  }

  /**
   * Obtener registros actuales del cache
   */
  getCurrentSyncRecords(): LeadCarsSyncRecord[] {
    return this.syncRecordsSubject.value;
  }

  /**
   * Limpiar estado
   */
  clearState(): void {
    this.configSubject.next(null);
    this.syncRecordsSubject.next([]);
    this.errorSubject.next(null);
    this.loadingSubject.next(false);
    this.savingSubject.next(false);
    this.concesionariosSubject.next([]);
    this.sedesSubject.next([]);
    this.campanasSubject.next([]);
    this.tiposLeadSubject.next([]);
  }

  // ============================================
  // Métodos para datos de LeadCars API
  // ============================================

  /**
   * Obtener concesionarios de LeadCars
   * GET /api/v1/leads/admin/leadcars/concesionarios
   */
  getConcesionarios(clienteToken?: string, useSandbox?: boolean): Observable<LeadCarsConcesionario[]> {
    const params: Record<string, string> = {};
    if (clienteToken) {
      params['clienteToken'] = clienteToken;
      if (useSandbox !== undefined) params['useSandbox'] = String(useSandbox);
    }
    const options = {
      ...this.getHttpOptions(),
      params,
    };
    return this.http
      .get<LeadCarsConcesionario[]>(
        `${this.baseUrl}/leadcars/concesionarios`,
        options
      )
      .pipe(
        tap((concesionarios) =>
          this.concesionariosSubject.next(concesionarios)
        ),
        catchError((error) => {
          console.error('Error al obtener concesionarios:', error);
          this.concesionariosSubject.next([]);
          return throwError(() => error);
        })
      );
  }

  /**
   * Obtener sedes de un concesionario
   * GET /api/v1/leads/admin/leadcars/sedes/:concesionarioId
   */
  getSedes(
    concesionarioId: number,
    clienteToken?: string,
    useSandbox?: boolean
  ): Observable<LeadCarsSede[]> {
    const params: Record<string, string> = {};
    if (clienteToken) {
      params['clienteToken'] = clienteToken;
      if (useSandbox !== undefined) params['useSandbox'] = String(useSandbox);
    }
    const options = {
      ...this.getHttpOptions(),
      params,
    };
    return this.http
      .get<LeadCarsSede[]>(
        `${this.baseUrl}/leadcars/sedes/${concesionarioId}`,
        options
      )
      .pipe(
        tap((sedes) => this.sedesSubject.next(sedes)),
        catchError((error) => {
          console.error('Error al obtener sedes:', error);
          this.sedesSubject.next([]);
          return throwError(() => error);
        })
      );
  }

  /**
   * Obtener campañas de un concesionario
   * GET /api/v1/leads/admin/leadcars/campanas/:concesionarioId
   */
  getCampanas(
    concesionarioId: number,
    clienteToken?: string,
    useSandbox?: boolean
  ): Observable<LeadCarsCampana[]> {
    const params: Record<string, string> = {};
    if (clienteToken) {
      params['clienteToken'] = clienteToken;
      if (useSandbox !== undefined) params['useSandbox'] = String(useSandbox);
    }
    const options = {
      ...this.getHttpOptions(),
      params,
    };
    return this.http
      .get<LeadCarsCampana[]>(
        `${this.baseUrl}/leadcars/campanas/${concesionarioId}`,
        options
      )
      .pipe(
        tap((campanas) => this.campanasSubject.next(campanas)),
        catchError((error) => {
          console.error('Error al obtener campañas:', error);
          this.campanasSubject.next([]);
          return throwError(() => error);
        })
      );
  }

  /**
   * Obtener tipos de lead de LeadCars
   * GET /api/v1/leads/admin/leadcars/tipos
   */
  getTiposLead(clienteToken?: string, useSandbox?: boolean): Observable<LeadCarsTipoLead[]> {
    const params: Record<string, string> = {};
    if (clienteToken) {
      params['clienteToken'] = clienteToken;
      if (useSandbox !== undefined) params['useSandbox'] = String(useSandbox);
    }
    const options = {
      ...this.getHttpOptions(),
      params,
    };
    return this.http
      .get<LeadCarsTipoLead[]>(
        `${this.baseUrl}/leadcars/tipos`,
        options
      )
      .pipe(
        tap((tipos) => this.tiposLeadSubject.next(tipos)),
        catchError((error) => {
          console.error('Error al obtener tipos de lead:', error);
          this.tiposLeadSubject.next([]);
          return throwError(() => error);
        })
      );
  }

  /**
   * Limpiar sedes y campañas (cuando cambia el concesionario)
   */
  clearSedesYCampanas(): void {
    this.sedesSubject.next([]);
    this.campanasSubject.next([]);
  }
}
