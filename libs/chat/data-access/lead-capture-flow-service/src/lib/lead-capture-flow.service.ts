import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ENVIRONMENT_TOKEN } from '@guiders-frontend/auth/data-access/session';
import {
  LeadCaptureFlowEnvelope,
  SaveLeadCaptureFlowRequest,
} from './lead-capture-flow.types';

@Injectable({ providedIn: 'root' })
export class LeadCaptureFlowService {
  private readonly http = inject(HttpClient);
  private readonly environment = inject(ENVIRONMENT_TOKEN);

  private get baseUrl(): string {
    return `${this.environment.api.baseUrl}/v2/lead-capture/flow`;
  }

  getFlow(): Observable<LeadCaptureFlowEnvelope> {
    return this.http.get<LeadCaptureFlowEnvelope>(this.baseUrl, {
      withCredentials: true,
    });
  }

  saveFlow(
    request: SaveLeadCaptureFlowRequest,
  ): Observable<LeadCaptureFlowEnvelope> {
    return this.http.put<LeadCaptureFlowEnvelope>(this.baseUrl, request, {
      withCredentials: true,
    });
  }
}
