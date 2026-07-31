import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
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
   * Obtiene datos de contacto. 404 → null.
   */
  getContactData(visitorId: string): Observable<LeadContactData | null> {
    const cached = this.cacheByVisitorId.get(visitorId);
    if (cached) return of(cached);
    if (this.missIds.has(visitorId)) return of(null);

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

  listContactData(): Observable<LeadContactData[]> {
    return this.http
      .get<LeadContactData[]>(`${this.baseUrl}/contact-data`, {
        withCredentials: true,
      })
      .pipe(
        tap((list) => {
          this.bulkLoaded = true;
          for (const contact of list) {
            this.putCache(contact);
          }
        }),
        catchError(() => {
          this.bulkLoaded = true;
          return of([] as LeadContactData[]);
        })
      );
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
