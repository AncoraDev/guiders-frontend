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

export interface PlatformConsoleBrand {
  branding: {
    brandName: string;
    logoUrl?: string | null;
    faviconUrl?: string | null;
  };
  consoleTheme?: string;
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

export interface PlatformUpdateCompanyRequest {
  companyName: string;
  sites: Array<{
    id?: string;
    name: string;
    canonicalDomain: string;
    domainAliases?: string[];
  }>;
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

export interface PlatformIntegrationApiKey {
  id: string;
  name: string;
  tokenPrefix: string;
  environment: 'live' | 'test' | string;
  status: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface PlatformCreateIntegrationApiKeyResponse {
  id: string;
  name: string;
  token: string;
  tokenPrefix: string;
  environment: string;
  createdAt: string;
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
  lastName?: string;
  email: string;
  phone?: string;
  roles: PlatformAssignableRole[];
  temporaryPassword: string;
}

export interface PlatformUpdateUserRequest {
  name?: string;
  email?: string;
  roles?: PlatformAssignableRole[];
  password?: string;
}

export interface PlatformSetUserActiveRequest {
  isActive: boolean;
}

export interface PlatformUserMutationResponse {
  userId: string;
}

export interface PlatformSdkRelease {
  version: string;
  publishedAt: string | null;
  prerelease: boolean;
  notes: string;
  wordpressZipUrl: string | null;
  webScriptUrl: string | null;
}

export interface PlatformProvider {
  id: string;
  companyId: string;
  name: string;
  token: string;
  tokenPrefix: string;
  status: string;
  demoAdminEmail: string;
  demoAdminPassword: string;
  createdAt: string;
  clientCount: number;
}

export interface PlatformCreateProviderResponse {
  id: string;
  companyId: string;
  name: string;
  token: string;
  tokenPrefix: string;
}

export interface PlatformProviderTokenResponse {
  token: string;
  tokenPrefix: string;
}
