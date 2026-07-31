import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ENVIRONMENT_TOKEN } from '@guiders-frontend/auth/data-access/session';
import {
  CompanyUsersListResponse,
  CreateCompanyUserRequest,
  UpdateCompanyUserRequest,
  SetCompanyUserActiveRequest,
  CompanyUserMutationResponse,
} from './company-users.types';

@Injectable({ providedIn: 'root' })
export class CompanyUsersService {
  private readonly http = inject(HttpClient);
  private readonly environment = inject(ENVIRONMENT_TOKEN);

  private get baseUrl(): string {
    return `${this.environment.api.baseUrl}/user/auth/company-users`;
  }

  listCompanyUsers(): Observable<CompanyUsersListResponse> {
    return this.http.get<CompanyUsersListResponse>(this.baseUrl, {
      withCredentials: true,
    });
  }

  createCompanyUser(
    body: CreateCompanyUserRequest,
  ): Observable<CompanyUserMutationResponse> {
    return this.http.post<CompanyUserMutationResponse>(this.baseUrl, body, {
      withCredentials: true,
    });
  }

  updateCompanyUser(
    userId: string,
    body: UpdateCompanyUserRequest,
  ): Observable<{ ok: true }> {
    return this.http.patch<{ ok: true }>(`${this.baseUrl}/${userId}`, body, {
      withCredentials: true,
    });
  }

  setCompanyUserActive(
    userId: string,
    body: SetCompanyUserActiveRequest,
  ): Observable<{ ok: true }> {
    return this.http.patch<{ ok: true }>(
      `${this.baseUrl}/${userId}/active`,
      body,
      { withCredentials: true },
    );
  }

  deleteCompanyUser(userId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${userId}`, {
      withCredentials: true,
    });
  }
}
