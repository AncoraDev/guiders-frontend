// Copia a apps/admin/src/environments/environment.prod.ts
// Sustituye __DOMAIN__ antes del primer build de prod.

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
  production: true,
  auth: {
    authority: 'https://auth.__DOMAIN__/realms/guiders',
    clientId: 'admin',
    scope: 'openid profile email',
    secureRoutes: ['https://api.__DOMAIN__/api'],
  },
  api: {
    baseUrl: 'https://api.__DOMAIN__/api',
  },
  consoleUrl: 'https://console.__DOMAIN__',
  version: '0.0.0-local',
};
