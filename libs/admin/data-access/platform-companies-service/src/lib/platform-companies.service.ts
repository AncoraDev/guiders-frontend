import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ENVIRONMENT_TOKEN } from '@guiders-frontend/auth/data-access/session';
import {
  PlatformApiKey,
  PlatformCompanyDetail,
  PlatformCompanySummary,
  PlatformCreateApiKeyResponse,
  PlatformCreateIntegrationApiKeyResponse,
  PlatformIntegrationApiKey,
  PlatformCreateCompanyRequest,
  PlatformCreateCompanyResponse,
  PlatformUpdateCompanyRequest,
  PlatformConsoleBrand,
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

  updateCompany(
    companyId: string,
    body: PlatformUpdateCompanyRequest,
  ): Observable<PlatformCompanyDetail> {
    return this.http.patch<PlatformCompanyDetail>(
      `${this.baseUrl}/${companyId}`,
      body,
      { withCredentials: true },
    );
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

  listIntegrationApiKeys(
    companyId: string,
  ): Observable<PlatformIntegrationApiKey[]> {
    return this.http.get<PlatformIntegrationApiKey[]>(
      `${this.baseUrl}/${companyId}/integration-api-keys`,
      { withCredentials: true },
    );
  }

  createIntegrationApiKey(
    companyId: string,
    name: string,
    environment: 'live' | 'test',
  ): Observable<PlatformCreateIntegrationApiKeyResponse> {
    return this.http.post<PlatformCreateIntegrationApiKeyResponse>(
      `${this.baseUrl}/${companyId}/integration-api-keys`,
      { name, environment },
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

  getConsoleBrand(companyId: string): Observable<PlatformConsoleBrand> {
    return this.http.get<PlatformConsoleBrand>(
      `${this.environment.api.baseUrl}/v2/companies/${companyId}/white-label`,
      { withCredentials: true },
    );
  }

  updateConsoleBrand(
    companyId: string,
    brandName: string,
    consoleTheme: string,
  ): Observable<PlatformConsoleBrand> {
    return this.http.patch<PlatformConsoleBrand>(
      `${this.environment.api.baseUrl}/v2/companies/${companyId}/white-label`,
      { branding: { brandName }, consoleTheme },
      { withCredentials: true },
    );
  }

  deleteUser(userId: string): Observable<void> {
    return this.http.delete<void>(`${this.usersUrl}/${userId}`, {
      withCredentials: true,
    });
  }
}
