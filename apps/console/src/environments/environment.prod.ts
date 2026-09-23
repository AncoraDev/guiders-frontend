// Servidor nuevo: copia docs/ops/new-server/environment.console.prod.example.ts
// y sustituye __DOMAIN__ antes del primer build de producción.
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
    wsUrl?: string; // URL específica para WebSocket (opcional)
  };
  adminUrl: string;
  version?: string;
}

export const environment: Environment = {
  production: true,
  auth: {
    authority: 'https://guiders-auth.ancoradual.com/realms/guiders',
    clientId: 'console',
    scope: 'openid profile email',
    secureRoutes: ['https://guiders-api.ancoradual.com/api'],
  },
  api: {
    baseUrl: 'https://guiders-api.ancoradual.com/api',
    wsUrl: 'https://guiders-api.ancoradual.com',
  },
  adminUrl: 'https://guiders-admin.ancoradual.com',
  version: '0.0.0-local',
};
