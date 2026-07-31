# Sistema de Datos Mock - Guiders Frontend

## 📋 Descripción

Este proyecto implementa un sistema de alternancia entre datos mock y servicios reales usando **Angular 20 Injection Tokens** y variables de entorno de Vite. Esto permite desarrollar y probar la aplicación sin necesidad de conexión al backend.

## 🏗️ Arquitectura

### Componentes principales:

1. **InjectionToken**: `USE_MOCK_DATA` (`@guiders-frontend/shared/config`)
   - Token de Angular que lee la variable de entorno `VITE_USE_MOCK_DATA`
   - Se inyecta en componentes para decidir qué implementación usar

2. **Datos Mock**: `visitors-mock-data.ts`
   - Genera 100 visitantes con datos realistas en español
   - Incluye nombres, emails, dominios, ubicaciones y tags
   - Simula latencia de red para testing realista

3. **Lógica Condicional**: En componentes que usan servicios
   - Verifica el valor de `useMockData = inject(USE_MOCK_DATA)`
   - Ejecuta mock o servicio real según configuración

## 🚀 Uso

### Scripts disponibles en package.json:

```bash
# Console (puerto 4200)
npm run serve              # Console con servicios REALES
npm run serve:mock         # Console con datos MOCK
npm run dev                # Development con servicios REALES
npm run dev:mock           # Development con datos MOCK

# Admin (puerto 4201)
npm run serve:admin        # Admin con servicios REALES
npm run serve:admin:mock   # Admin con datos MOCK
npm run dev:admin          # Development con servicios REALES
npm run dev:admin:mock     # Development con datos MOCK
```

### Ejemplos de uso:

```bash
# Desarrollo normal con backend real
npm run serve

# Testing sin backend (usando mocks)
npm run serve:mock

# Admin con datos mock para demo
npm run serve:admin:mock
```

## ⚙️ Configuración

### Variables de entorno (`.env` o `.env.local`):

```bash
# Activar modo mock
VITE_USE_MOCK_DATA=true

# Desactivar modo mock (por defecto)
VITE_USE_MOCK_DATA=false
```

**Nota**: Las variables con prefijo `VITE_` son expuestas al cliente por Vite durante el build.

## 🔧 Implementación Técnica

### 1. Token de Inyección (`libs/shared/config/src/lib/tokens/use-mock-data.token.ts`):

```typescript
export const USE_MOCK_DATA = new InjectionToken<boolean>('use.mock.data', {
  providedIn: 'root',
  factory: () => {
    return typeof import.meta !== 'undefined' && 
           (import.meta as unknown as ViteImportMeta).env?.VITE_USE_MOCK_DATA === 'true';
  }
});
```

### 2. Uso en componentes (`visitors.ts`):

```typescript
export class VisitorsComponent {
  private readonly useMockData = inject(USE_MOCK_DATA);
  
  loadVisitors(): void {
    if (this.useMockData) {
      // Usar datos mock
      const mockResponse = getMockVisitorsResponse(limit, offset);
      // ...
    } else {
      // Usar servicio real
      this.visitorsService.getVisitors(tenantId, queryParams)
        .subscribe(response => {
          // ...
        });
    }
  }
}
```

## 📦 Datos Mock Disponibles

### Visitantes (`visitors-mock-data.ts`):

- **Función**: `generateMockVisitors(count: number)`
  - Genera N visitantes con datos aleatorios
  - Nombres y apellidos españoles
  - Emails corporativos realistas
  - Dominios de empresas españolas
  - Ubicaciones de ciudades españolas
  - Tags aleatorios (VIP, Nuevo, Frecuente, Premium)

- **Función**: `getMockVisitorsResponse(limit: number, offset: number)`
  - Maneja paginación de visitantes
  - Retorna slice del array completo
  - Simula respuesta del backend con total y hasMore

- **Función**: `getMockVisitorStats()`
  - Retorna estadísticas coherentes
  - Total: 100 visitantes
  - Online: 23 visitantes
  - Con chat activo: 12 visitantes
  - Leads: 8 visitantes

## 🎯 Ventajas

1. **Desarrollo sin backend**: Trabaja en la UI sin esperar al backend
2. **Testing rápido**: Datos consistentes para pruebas
3. **Demos**: Presenta funcionalidades con datos realistas
4. **Latencia simulada**: Prueba estados de loading
5. **Sin cambios de código**: Alterna con variables de entorno
6. **Type-safe**: Usa los mismos tipos que el servicio real

## 🔄 Añadir Mock a Otros Servicios

Para añadir mock a otros servicios, sigue este patrón:

1. **Crea el archivo mock** (`service-name-mock-data.ts`):
```typescript
export function getMockServiceData() {
  return {
    // datos mock
  };
}
```

2. **Inyecta el token en el componente**:
```typescript
private readonly useMockData = inject(USE_MOCK_DATA);
```

3. **Implementa lógica condicional**:
```typescript
if (this.useMockData) {
  // usar mock
} else {
  // usar servicio real
}
```

## 📝 Notas Importantes

- Los mocks **solo se usan en desarrollo**, no en producción
- La variable `VITE_USE_MOCK_DATA` se evalúa en **tiempo de build**
- Cambiar el valor requiere **reiniciar el servidor de desarrollo**
- Los datos mock están en español para coherencia con el proyecto
- La paginación mock simula correctamente el comportamiento del backend

## 🧪 Testing

Para testing automatizado, puedes configurar el token directamente:

```typescript
// En un test
TestBed.configureTestingModule({
  providers: [
    { provide: USE_MOCK_DATA, useValue: true }
  ]
});
```

## 🔍 Troubleshooting

### El mock no se activa:
1. Verifica que la variable esté en `.env` o `.env.local`
2. Reinicia el servidor de desarrollo (`npm run serve:mock`)
3. Verifica que el prefijo sea `VITE_` (requerido por Vite)

### Compilación falla:
1. Asegúrate de que `@guiders-frontend/shared/config` esté en `tsconfig.base.json`
2. Verifica que el path mapping esté correcto
3. Ejecuta `nx reset` para limpiar cache

## 📚 Referencias

- [Angular Dependency Injection](https://angular.dev/guide/di)
- [InjectionToken Pattern](https://angular.dev/api/core/InjectionToken)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
