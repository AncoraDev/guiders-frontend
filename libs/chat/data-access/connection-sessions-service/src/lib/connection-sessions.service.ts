import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ENVIRONMENT_TOKEN } from '@guiders-frontend/auth/data-access/session';
import {
  ConnectionSessionsListResponse,
  ConnectionSessionsQuery,
} from './connection-sessions.types';

@Injectable({ providedIn: 'root' })
export class ConnectionSessionsService {
  private readonly http = inject(HttpClient);
  private readonly environment = inject(ENVIRONMENT_TOKEN);

  private get baseUrl(): string {
    return `${this.environment.api.baseUrl}/v2/commercials/connection-sessions`;
  }

  listSessions(
    query: ConnectionSessionsQuery = {},
  ): Observable<ConnectionSessionsListResponse> {
    let params = new HttpParams();

    if (query.page != null) {
      params = params.set('page', String(query.page));
    }
    if (query.limit != null) {
      params = params.set('limit', String(query.limit));
    }
    if (query.from) {
      params = params.set('from', query.from);
    }
    if (query.to) {
      params = params.set('to', query.to);
    }
    if (query.endReason) {
      params = params.set('endReason', query.endReason);
    }
    if (query.status) {
      params = params.set('status', query.status);
    }
    if (query.commercialId) {
      params = params.set('commercialId', query.commercialId);
    }

    return this.http.get<ConnectionSessionsListResponse>(this.baseUrl, {
      params,
      withCredentials: true,
    });
  }
}
