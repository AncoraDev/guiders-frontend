export interface CompanyUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  companyId: string;
  isActive: boolean;
  keycloakId: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface CompanyUsersListResponse {
  users: CompanyUser[];
}

/** Roles asignables desde Console (sin superadmin) */
export type AssignableCompanyRole = 'admin' | 'commercial' | 'supervisor';

export interface CreateCompanyUserRequest {
  name: string;
  email: string;
  roles: AssignableCompanyRole[];
}

export interface UpdateCompanyUserRequest {
  name?: string;
  roles?: AssignableCompanyRole[];
}

export interface SetCompanyUserActiveRequest {
  isActive: boolean;
}

export interface CompanyUserMutationResponse {
  userId: string;
}
