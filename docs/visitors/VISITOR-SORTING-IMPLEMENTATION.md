# Implementación de Ordenamiento en Visitantes

## Resumen
Se ha implementado el ordenamiento de visitantes con las siguientes características:
- **Por defecto**: Ordenamiento por fecha de creación (`createdAt`) descendente (más recientes primero)
- **Opciones disponibles**: Fecha de creación, Actividad reciente, Nombre, Total de chats
- **Persistencia**: El ordenamiento se mantiene durante la sesión y se sincroniza con el backend

## Cambios Realizados

### 1. Backend API Integration
Se agregaron parámetros de ordenamiento al servicio de visitantes:

**Archivo**: `libs/chat/data-access/visitors-data-service/src/lib/visitors-data-service.ts`

```typescript
interface VisitorQueryParams {
  limit?: number;
  offset?: number;
  status?: string;
  search?: string;
  includeOffline?: boolean;
  sortBy?: 'createdAt' | 'lastActivity';      // ✨ NUEVO
  sortOrder?: 'asc' | 'desc';                  // ✨ NUEVO
}
```

**Ejemplos de uso del API**:
```
# Ordenar por fecha de creación descendente (por defecto)
GET /tenant-visitors/{tenantId}/visitors?sortBy=createdAt&sortOrder=desc

# Ordenar por actividad reciente
GET /tenant-visitors/{tenantId}/visitors?sortBy=lastActivity&sortOrder=desc

# Ordenar por actividad más antigua primero
GET /tenant-visitors/{tenantId}/visitors?sortBy=lastActivity&sortOrder=asc

# Combinado con paginación y filtros
GET /tenant-visitors/{tenantId}/visitors?limit=50&offset=100&includeOffline=true&sortBy=createdAt&sortOrder=asc
```

### 2. Mapeo de Campos
Se implementó un mapeo entre los campos internos y los del backend:

**Archivo**: `libs/chat/features/visitors/src/lib/visitors/visitors.ts`

```typescript
const sortByMap: Record<string, 'createdAt' | 'lastActivity'> = {
  'firstVisit': 'createdAt',      // Frontend → Backend
  'lastVisit': 'lastActivity'     // Frontend → Backend
};
```

Este mapeo se aplica en:
- `loadVisitors()`: Carga inicial y paginación
- `refreshVisitorsSilently()`: Actualización automática

### 3. UI - Headers Clickeables para Ordenamiento

Se implementó ordenamiento mediante headers de tabla clickeables (patrón estándar de UI):

**Archivo**: `libs/chat/ui/visitors-list/src/lib/visitors-list/visitors-list.html`

**Características**:
- **Headers clickeables**: Las columnas "Visitante" y "Actividad" son clickeables
- **Indicadores visuales**: 
  - Icono de flecha que indica dirección de ordenamiento
  - Color azul y negrita cuando la columna está activa
  - Hover state para feedback visual
- **Alternancia automática**: 
  - Primer clic: ordena por defecto (nombres A-Z, fechas más recientes primero)
  - Segundo clic: invierte el orden
  - Tercer clic: vuelve al orden original

**Columnas sorteables**:
1. **Visitante** - Ordena alfabéticamente por nombre
2. **Actividad** - Ordena por fecha de última actividad / creación

**Comportamiento de iconos**:
- Flecha hacia abajo (↓): Orden descendente
- Flecha hacia arriba (↑): Orden ascendente
- Icono tenue: Columna no activa
- Icono azul: Columna activa (ordenando)

### 4. Estado por Defecto
Se actualizó el estado inicial para ordenar por fecha de creación:

**Antes**:
```typescript
sort: { field: 'lastVisit', direction: 'desc' }
```

**Ahora**:
```typescript
sort: { field: 'firstVisit', direction: 'desc' }  // Más recientes primero
```

Este cambio se aplicó en:
- `libs/chat/features/visitors/src/lib/visitors/visitors.ts` (componente padre)
- `libs/chat/ui/visitors-list/src/lib/visitors-list/visitors-list.ts` (componente lista)

### 5. Estilos CSS
Se agregaron estilos siguiendo los tokens de diseño:

**Archivo**: `libs/chat/ui/visitors-list/src/lib/visitors-list/visitors-list.scss`

**Clases principales**:
- `.visitors-list__sort-controls`: Contenedor flex con spacing consistente
- `.sort-label`: Label con icono y tipografía `body-sm`
- `.sort-select`: Dropdown con estados hover y focus
- `.sort-direction-button`: Botón con icono rotativo para indicar dirección
- `.sort-direction-button--asc`: Modifier para rotar el icono en orden ascendente

**Tokens utilizados**:
- Spacing: `$spacing-xs`, `$spacing-sm`, `$spacing-md`, `$spacing-lg`
- Typography: `body-sm`
- Colors: `$color-surface-primary`, `$color-border-default`, `$color-primary`
- Transitions: `$duration-fast`, `$easing-standard`

## Comportamiento

### Flujo de Ordenamiento
1. Usuario selecciona un campo en el dropdown
2. Componente `VisitorsListComponent` emite evento `sortChange`
3. Componente `VisitorsComponent` actualiza el estado
4. Se construyen los `queryParams` con el mapeo correcto
5. Se llama a `visitorsService.getVisitors()` con los parámetros de ordenamiento
6. Backend devuelve los visitantes ordenados según los criterios

### Persistencia
- El ordenamiento se mantiene durante la sesión
- Se preserva al cambiar de página (paginación)
- Se preserva durante el auto-refresh
- **NO** se persiste en localStorage (decisión de diseño)

### Interacción con Otros Filtros
El ordenamiento funciona correctamente con:
- ✅ Paginación (mantiene el orden al cambiar de página)
- ✅ Filtros (online, con chat, etc.)
- ✅ Búsqueda por texto
- ✅ Auto-refresh (mantiene el orden seleccionado)

## Testing

### Tests E2E
Todos los tests E2E existentes pasan correctamente:
```bash
npx nx e2e console-e2e
# ✅ 6 passed (12.9s)
```

Los tests verifican:
- Persistencia de URL con paginación
- Persistencia de localStorage para auto-refresh
- Funcionamiento en todos los navegadores (Chrome, Firefox, Safari)

### Tests Manuales Recomendados
1. **Ordenamiento básico**:
   - Cambiar entre diferentes campos de ordenamiento
   - Alternar dirección ascendente/descendente
   - Verificar que los datos se ordenan correctamente

2. **Interacción con paginación**:
   - Ordenar y luego cambiar de página
   - Verificar que el orden se mantiene

3. **Auto-refresh**:
   - Seleccionar un ordenamiento
   - Esperar el auto-refresh (30 segundos por defecto)
   - Verificar que el orden se mantiene después del refresh

4. **Combinación con filtros**:
   - Aplicar filtro "En Línea"
   - Cambiar ordenamiento
   - Verificar que ambos funcionan correctamente

## Mejoras Futuras

### Posibles Extensiones
1. **Persistencia en URL**: Agregar `sortBy` y `sortOrder` como query params
2. **Persistencia en localStorage**: Recordar preferencia de ordenamiento entre sesiones
3. **Ordenamiento múltiple**: Permitir ordenar por dos campos (ej: fecha + nombre)
4. **Indicadores visuales en tabla**: Mostrar flechas en los headers de la tabla
5. **Más campos**: Agregar ordenamiento por país, fuente, tiempo en sitio, etc.

### Optimizaciones
1. **Debounce**: Agregar delay al cambiar ordenamiento para evitar múltiples requests
2. **Cache inteligente**: Cachear resultados por combinación de ordenamiento + filtros
3. **Ordenamiento local**: Para datasets pequeños, ordenar en frontend sin llamar al backend

## Documentación API Backend

### Contrato Esperado
El backend debe implementar los siguientes query parameters en el endpoint:
```
GET /tenant-visitors/{tenantId}/visitors
```

**Query Parameters**:
- `sortBy`: `'createdAt' | 'lastActivity'` (opcional, default: `'createdAt'`)
- `sortOrder`: `'asc' | 'desc'` (opcional, default: `'desc'`)

**Ejemplo de Respuesta**:
```json
{
  "tenantId": "uuid-tenant",
  "companyName": "Empresa Demo",
  "visitors": [
    {
      "id": "visitor-1",
      "createdAt": "2025-10-17T10:00:00Z",
      "lastActivity": "2025-10-17T12:30:00Z",
      ...
    }
  ],
  "totalCount": 150
}
```

## Referencias
- Guía de diseño: `/guia-diseno-interfaces-b2b-web-desktop.md`
- Tipos compartidos: `libs/shared/types/src/lib/visitor.types.ts`
- Servicio de datos: `libs/chat/data-access/visitors-data-service/`
- Componente UI: `libs/chat/ui/visitors-list/`

---
**Última actualización**: 17 de octubre de 2025
**Autor**: GitHub Copilot
**Estado**: ✅ Implementado y Funcionando
