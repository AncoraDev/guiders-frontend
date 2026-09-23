# Frontend en un servidor nuevo

El mapa de DNS, nginx, bootstrap del VPS y el orden de encendido viven en
el backend: `guiders-backend/docs/ops/new-server/`.

Este directorio solo cubre lo que hay que cambiar **en este repo** antes
del primer build de producción.

## Secrets de GitHub

Settings → Secrets and variables → Actions. El workflow
`.github/workflows/deploy.yml` etiqueta el job como staging y usa nombres
`STAGING_*`, pero el build es **production**.

| Secret | Placeholder |
|--------|-------------|
| `STAGING_SSH_HOST` | `api.__DOMAIN__` o IP pública (mismo host que el backend) |
| `STAGING_SSH_USER` | `deploy` |
| `STAGING_SSH_PORT` | `22` |
| `STAGING_SSH_PASSWORD` | *(sshpass; o deja WireGuard+VPN)* |
| `STAGING_DEPLOY_PATH` | `/var/www/guiders-frontend` |
| `WG_PRIVATE_KEY` | vacío el primer día → SSH directo, sin ping a `10.0.0.1` |
| `WG_SERVER_ENDPOINT` | solo si montas VPN después |

`BACKEND_REPO` + `BACKEND_REPO_TOKEN` solo si quieres el job E2E que clona
el backend.

## `environment.prod.ts`

Copia las plantillas y sustituye `__DOMAIN__` **antes** del primer
`nx build` production / push a `main`:

- [environment.console.prod.example.ts](./environment.console.prod.example.ts)
  → `apps/console/src/environments/environment.prod.ts`
- [environment.admin.prod.example.ts](./environment.admin.prod.example.ts)
  → `apps/admin/src/environments/environment.prod.ts`

Valores que deben coincidir con Keycloak y con los secrets del backend:

| Campo | Valor |
|-------|--------|
| `auth.authority` | `https://auth.__DOMAIN__/realms/guiders` |
| `api.baseUrl` | `https://api.__DOMAIN__/api` |
| `api.wsUrl` (solo Console) | `https://api.__DOMAIN__` |
| `adminUrl` / `consoleUrl` | `https://admin.__DOMAIN__` / `https://console.__DOMAIN__` |

La rama que no es `main` no despliega. Usa merge o `workflow_dispatch`.
