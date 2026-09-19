import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import {
  Observable,
  catchError,
  forkJoin,
  map,
  of,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import {
  SaveContactDataRequest,
  LeadContactData,
  LeadFollowUpStatus,
  ListContactDataFilters,
  resolveFollowUpStatus,
} from '@guiders-frontend/shared/types';
import { ENVIRONMENT_TOKEN } from '@guiders-frontend/auth/data-access/session';

/**
 * API + caché compartida de contactos (Atención / Visitantes).
 */
@Injectable({ providedIn: 'root' })
export class LeadContactService {
  private readonly http = inject(HttpClient);
  private readonly environment = inject(ENVIRONMENT_TOKEN);

  private readonly cacheByVisitorId = new Map<string, LeadContactData>();
  private readonly missIds = new Set<string>();
  private bulkLoaded = false;

  /** Leads captados que el comercial aún no ha tratado. */
  readonly pendingCount = signal(0);

  private get baseUrl(): string {
    return `${this.environment.api.baseUrl}/leads`;
  }

  saveContactData(
    visitorId: string,
    data: SaveContactDataRequest
  ): Observable<LeadContactData> {
    return this.http
      .post<LeadContactData>(
        `${this.baseUrl}/contact-data/${visitorId}`,
        data,
        { withCredentials: true }
      )
      .pipe(tap((saved) => this.putCache(saved)));
  }

  /**
   * Olvida un 404. El visitante pudo dejar sus datos después de la primera
   * consulta, y un miss permanente dejaría la ficha vacía.
   */
  invalidate(visitorId: string): void {
    this.missIds.delete(visitorId);
  }

  /**
   * Obtiene datos de contacto. 404 → null.
   * `force` ignora caché y miss: hace falta al abrir un chat que acaba de
   * captarse, porque la cola pudo consultar al visitante cuando aún no tenía ficha.
   */
  getContactData(
    visitorId: string,
    options?: { force?: boolean }
  ): Observable<LeadContactData | null> {
    if (options?.force) {
      this.cacheByVisitorId.delete(visitorId);
      this.invalidate(visitorId);
    } else {
      const cached = this.cacheByVisitorId.get(visitorId);
      if (cached) return of(cached);
      if (this.missIds.has(visitorId)) return of(null);
    }

    return this.http
      .get<LeadContactData>(`${this.baseUrl}/contact-data/${visitorId}`, {
        withCredentials: true,
      })
      .pipe(
        tap((contact) => {
          if (contact) this.putCache(contact);
        }),
        catchError((err: HttpErrorResponse) => {
          if (err.status === 404) {
            this.missIds.add(visitorId);
            return of(null);
          }
          return throwError(() => err);
        })
      );
  }

  listContactData(
    filters?: ListContactDataFilters
  ): Observable<LeadContactData[]> {
    let params = new HttpParams();
    if (filters?.source) params = params.set('source', filters.source);
    if (filters?.status) params = params.set('status', filters.status);

    return this.http
      .get<LeadContactData[]>(`${this.baseUrl}/contact-data`, {
        params,
        withCredentials: true,
      })
      .pipe(
        tap((list) => {
          if (!filters?.source && !filters?.status) {
            this.bulkLoaded = true;
            this.pendingCount.set(
              list.filter((contact) => resolveFollowUpStatus(contact) === 'pending')
                .length
            );
          }
          for (const contact of list) {
            this.putCache(contact);
          }
          if (filters?.status === 'pending' && !filters?.source) {
            this.pendingCount.set(list.length);
          }
        }),
        catchError(() => {
          if (!filters?.source && !filters?.status) {
            this.bulkLoaded = true;
          }
          return of([] as LeadContactData[]);
        })
      );
  }

  updateFollowUp(
    visitorId: string,
    status: LeadFollowUpStatus
  ): Observable<LeadContactData> {
    return this.http
      .patch<LeadContactData>(
        `${this.baseUrl}/contact-data/${visitorId}/follow-up`,
        { status },
        { withCredentials: true }
      )
      .pipe(
        tap((saved) => {
          this.putCache(saved);
          this.refreshPendingCount();
        })
      );
  }

  refreshPendingCount(): void {
    this.listContactData({ status: 'pending' }).subscribe();
  }

  /** Lectura síncrona de caché (tras ensureContacts / getContactData). */
  peekCache(visitorId: string): LeadContactData | null {
    return this.cacheByVisitorId.get(visitorId) ?? null;
  }

  putCache(contact: LeadContactData | null | undefined): void {
    if (!contact?.visitorId) return;
    this.cacheByVisitorId.set(contact.visitorId, contact);
    this.missIds.delete(contact.visitorId);
  }

  /**
   * Asegura contactos en caché para los visitorIds (bulk + fetch por id).
   */
  ensureContacts(visitorIds: string[]): Observable<void> {
    const unique = [...new Set(visitorIds.filter(Boolean))];

    const bulk$ = this.bulkLoaded ? of(void 0) : this.listContactData().pipe(map(() => void 0));

    return bulk$.pipe(
      switchMap(() => {
        const missing = unique.filter(
          (id) => !this.cacheByVisitorId.has(id) && !this.missIds.has(id)
        );
        if (missing.length === 0) return of(void 0);

        return forkJoin(
          missing.map((id) => this.getContactData(id))
        ).pipe(map(() => void 0));
      })
    );
  }
}
