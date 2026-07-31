import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ENVIRONMENT_TOKEN } from '@guiders-frontend/auth/data-access/session';
import {
  PlatformApiKey,
  PlatformCompanyDetail,
  PlatformCompanySummary,
  PlatformCreateApiKeyResponse,
  PlatformCreateCompanyRequest,
  PlatformCreateCompanyResponse,
  PlatformCreateUserRequest,
  PlatformSetUserActiveRequest,
  PlatformUpdateUserRequest,
  PlatformUserMutationResponse,
  PlatformUsersListResponse,
} from './platform-companies.types';

@Injectable({ providedIn: 'root' })
export class PlatformCompaniesService {
  private readonly http = inject(HttpClient);
  private readonly environment = inject(ENVIRONMENT_TOKEN);

  private get baseUrl(): string {
    return `${this.environment.api.baseUrl}/platform/companies`;
  }

  private get usersUrl(): string {
    return `${this.environment.api.baseUrl}/platform/users`;
  }

  listCompanies(): Observable<PlatformCompanySummary[]> {
    return this.http.get<PlatformCompanySummary[]>(this.baseUrl, {
      withCredentials: true,
    });
  }

  getCompany(companyId: string): Observable<PlatformCompanyDetail> {
    return this.http.get<PlatformCompanyDetail>(`${this.baseUrl}/${companyId}`, {
      withCredentials: true,
    });
  }

  createCompany(
    body: PlatformCreateCompanyRequest,
  ): Observable<PlatformCreateCompanyResponse> {
    return this.http.post<PlatformCreateCompanyResponse>(this.baseUrl, body, {
      withCredentials: true,
    });
  }

  listApiKeys(companyId: string): Observable<PlatformApiKey[]> {
    return this.http.get<PlatformApiKey[]>(
      `${this.baseUrl}/${companyId}/api-keys`,
      { withCredentials: true },
    );
  }

  createApiKey(
    companyId: string,
    domain: string,
  ): Observable<PlatformCreateApiKeyResponse> {
    return this.http.post<PlatformCreateApiKeyResponse>(
      `${this.baseUrl}/${companyId}/api-keys`,
      { domain },
      { withCredentials: true },
    );
  }

  listUsers(): Observable<PlatformUsersListResponse> {
    return this.http.get<PlatformUsersListResponse>(this.usersUrl, {
      withCredentials: true,
    });
  }

  createUser(
    body: PlatformCreateUserRequest,
  ): Observable<PlatformUserMutationResponse> {
    return this.http.post<PlatformUserMutationResponse>(this.usersUrl, body, {
      withCredentials: true,
    });
  }

  updateUser(
    userId: string,
    body: PlatformUpdateUserRequest,
  ): Observable<{ ok: true }> {
    return this.http.patch<{ ok: true }>(`${this.usersUrl}/${userId}`, body, {
      withCredentials: true,
    });
  }

  setUserActive(
    userId: string,
    body: PlatformSetUserActiveRequest,
  ): Observable<{ ok: true }> {
    return this.http.patch<{ ok: true }>(
      `${this.usersUrl}/${userId}/active`,
      body,
      { withCredentials: true },
    );
  }

  deleteUser(userId: string): Observable<void> {
    return this.http.delete<void>(`${this.usersUrl}/${userId}`, {
      withCredentials: true,
    });
  }
}
