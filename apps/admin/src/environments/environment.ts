interface Environment {
  production: boolean;
  auth: {
    authority: string;
    clientId: string;
    scope: string;
    secureRoutes: string[];
  };
  api: {
    baseUrl: string;
  };
  consoleUrl: string;
  version?: string;
}

export const environment: Environment = {
  production: false,
  auth: {
    authority: 'http://localhost:8080/realms/guiders',
    clientId: 'admin',
    scope: 'openid profile email',
    // Absolute URL: OIDC callback is http://localhost:3000/api/bff/auth/callback/admin
    // (must match login origin so the PKCE session cookie is preserved).
    secureRoutes: ['http://localhost:3000/api'],
  },
  api: {
    baseUrl: 'http://localhost:3000/api',
  },
  consoleUrl: 'http://localhost:4200',
  version: '0.0.0-local',
};
