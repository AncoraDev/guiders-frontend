// Copia a apps/console/src/environments/environment.prod.ts
// Sustituye __DOMAIN__ (p. ej. midominio.com) antes del primer build de prod.

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
    wsUrl?: string;
  };
  adminUrl: string;
  version?: string;
}

export const environment: Environment = {
  production: true,
  auth: {
    authority: 'https://auth.__DOMAIN__/realms/guiders',
    clientId: 'console',
    scope: 'openid profile email',
    secureRoutes: ['https://api.__DOMAIN__/api'],
  },
  api: {
    baseUrl: 'https://api.__DOMAIN__/api',
    wsUrl: 'https://api.__DOMAIN__',
  },
  adminUrl: 'https://admin.__DOMAIN__',
  version: '0.0.0-local',
};
