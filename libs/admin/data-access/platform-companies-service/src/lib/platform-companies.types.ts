export interface PlatformCompanySummary {
  id: string;
  companyName: string;
  domains: string[];
  createdAt: string;
}

export interface PlatformCompanySite {
  id: string;
  name: string;
  canonicalDomain: string;
  domainAliases: string[];
}

export interface PlatformCompanyDetail {
  id: string;
  companyName: string;
  sites: PlatformCompanySite[];
  createdAt: string;
  updatedAt: string;
}

export interface PlatformCreateCompanyRequest {
  companyName: string;
  sites: Array<{
    name: string;
    canonicalDomain: string;
    domainAliases?: string[];
  }>;
  admin: {
    adminFirstName: string;
    adminLastName: string;
    adminEmail: string;
    adminTel?: string;
    adminPassword: string;
  };
}

export interface PlatformCreateCompanyResponse {
  companyId: string;
  adminUserId: string;
}

export interface PlatformApiKey {
  domain: string;
  apiKey: string;
  kid: string;
  publicKey: string;
  createdAt?: string;
}

export interface PlatformCreateApiKeyResponse {
  apiKey: string;
}

export interface PlatformUser {
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

export interface PlatformUsersSummary {
  total: number;
  active: number;
  inactive: number;
  byRole: Record<string, number>;
}

export interface PlatformUsersListResponse {
  users: PlatformUser[];
  summary: PlatformUsersSummary;
}

export type PlatformAssignableRole = 'admin' | 'commercial' | 'supervisor';

export interface PlatformCreateUserRequest {
  companyId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  roles: PlatformAssignableRole[];
  temporaryPassword: string;
}

export interface PlatformUpdateUserRequest {
  name?: string;
  roles?: PlatformAssignableRole[];
}

export interface PlatformSetUserActiveRequest {
  isActive: boolean;
}

export interface PlatformUserMutationResponse {
  userId: string;
}
