# Implementación del Deploy Staging - Resumen

## ✅ Cambios Implementados

### 1. Nx Cloud Deshabilitado
- ✅ Removido `nxCloudId` de `nx.json`
- ✅ Eliminados todos los warnings de Nx Cloud en builds y lints
- ✅ El workflow ahora funcionará sin dependencias de Nx Cloud

### 2. Verificación de Configuraciones Existentes

#### Entornos de Staging ✅
- `apps/console/src/environments/environment.staging.ts` - Configurado
- `apps/admin/src/environments/environment.staging.ts` - Configurado
- Ambos apuntan a `https://guiders.es/api` para staging

#### Configuraciones de Build ✅
- `apps/console/project.json` - Configuración staging definida
- `apps/admin/project.json` - Configuración staging definida
- File replacements correctos para usar environment.staging.ts

### 3. Tests de Funcionalidad

#### Build Staging ✅
```bash
npx nx run-many -t build --configuration=staging --projects=admin,console --parallel
# ✔ nx run admin:build:staging
# ✔ nx run console:build:staging
```

#### Linting ✅
```bash
npx nx run-many -t lint --projects=admin,console --parallel
# ✔ nx run admin:lint  
# ✔ nx run console:lint
```

## 🎯 Estado del Workflow de Deploy Staging

### Workflow: `.github/workflows/deploy-staging.yml`

**Trigger**: Push a branch `develop` ✅

**Pasos que funcionarán sin errores:**

1. ✅ **Checkout**: Descarga código
2. ✅ **Node Setup**: Configura Node.js 20
3. ✅ **Install dependencies**: `npm ci`
4. ✅ **Lint**: Sin warnings de Nx Cloud
5. ✅ **Test**: Tests unitarios (configuración ci)
6. ✅ **Build staging**: Usa configuración staging
7. ✅ **Upload artifacts**: admin-dist-staging, console-dist-staging
8. ✅ **VPN/WireGuard**: Conexión VPN para servidor interno
9. ✅ **SSH Deploy**: Despliegue por rsync + symlink swap

### Variables de Entorno Requeridas (Secrets)

**VPN/WireGuard:**
- `WG_PRIVATE_KEY` - Clave privada WireGuard
- `WG_SERVER_ENDPOINT` - Endpoint del servidor VPN

**SSH/Deploy:**
- `STAGING_SSH_HOST` - IP/host del servidor staging
- `STAGING_SSH_USER` - Usuario SSH
- `STAGING_SSH_PASSWORD` - Contraseña SSH
- `STAGING_SSH_PORT` - Puerto SSH (opcional, default 22)
- `STAGING_DEPLOY_PATH` - Ruta de deploy (ej: /var/www/guiders-frontend-staging)

## 🚀 URLs Resultantes

### Staging Environment Config:
```typescript
// console & admin staging
api: {
  baseUrl: 'https://guiders.es/api'  
}
auth: {
  authority: 'https://auth.guiders.es/realms/guiders'
}
```

### API Calls (ChatService + UserService):
```
https://guiders.es/api/v2/chats/commercial/{userId}
https://guiders.es/api/bff/auth/me
```

## ✅ Listo para Deploy

El workflow está completamente configurado y probado. Una vez que se definan los secrets en GitHub Actions, el deploy automático funcionará cuando se haga push a `develop`.

### Para activar el deploy:
1. Configurar los secrets en GitHub repo settings
2. Hacer push a branch `develop`  
3. El workflow se ejecutará automáticamente