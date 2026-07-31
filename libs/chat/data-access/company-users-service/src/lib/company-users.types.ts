export interface CompanyUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  companyId: string;
  isActive: boolean;
  keycloakId: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface CompanyUsersListResponse {
  users: CompanyUser[];
}

/** Roles asignables desde Console (sin superadmin) */
export type AssignableCompanyRole = 'admin' | 'commercial' | 'supervisor';

export interface CreateCompanyUserRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  roles: AssignableCompanyRole[];
  temporaryPassword: string;
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
