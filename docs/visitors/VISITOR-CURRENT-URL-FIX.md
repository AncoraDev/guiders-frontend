# Fix: Separar dominio de visitante y URL actual en la interfaz

## Problema Original

En la interfaz de lista de visitantes, el campo `autopractik.es` aparecía duplicado en dos secciones:

1. **Sección "Visitante"**: Mostraba `autopractik.es` (dominio del sitio)
2. **Sección "Actividad"**: También mostraba `autopractik.es` (debería mostrar la página actual)

Ambas secciones usaban el mismo campo `visitor.domain`, lo que causaba información redundante.

## Causa Raíz

### En el Frontend
- El template `visitors-list.html` usaba `visitor.domain` en ambas ubicaciones (líneas 98 y 159)
- El tipo `Visitor` tiene dos campos disponibles:
  - `domain: string` - Dominio del sitio web
  - `currentUrl?: string` - URL actual donde está navegando
- Sin embargo, solo se estaba usando `domain` en ambos lugares

### En el Backend
- El endpoint `/tenant-visitors/:tenantId/visitors` NO está enviando el campo `currentUrl`
- El tipo `TenantVisitor` solo incluye `siteName` pero no la URL actual de navegación

## Solución Implementada

### 1. Template actualizado ✅
**Archivo**: `libs/chat/ui/visitors-list/src/lib/visitors-list/visitors-list.html`

```html
<!-- ANTES (línea 159) -->
<span class="location-text">{{ visitor.domain }}</span>

<!-- DESPUÉS -->
<span class="location-text">{{ visitor.currentUrl || visitor.domain }}</span>
```

Ahora la sección "Actividad" mostrará:
- La URL completa si `currentUrl` está disponible (ej: `https://autopractik.es/cursos/b-permiso`)
- El dominio como fallback si `currentUrl` no está disponible

### 2. Tipo TenantVisitor actualizado ✅
**Archivo**: `libs/shared/types/src/lib/visitor.types.ts`

```typescript
export interface TenantVisitor {
  id: string;
  fingerprint: string;
  connectionStatus: "ONLINE" | "OFFLINE";
  siteId: string;
  siteName: string;
  currentUrl?: string; // ⬅️ NUEVO: URL actual donde está navegando el visitante
  createdAt: string;
  lastActivity: string;
  pendingChatIds: string[];
}
```

### 3. Mapeo en el servicio actualizado ✅
**Archivo**: `libs/chat/data-access/visitors-data-service/src/lib/visitors-data-service.ts`

```typescript
const mappedVisitors: Visitor[] = response.visitors.map(apiVisitor => ({
  id: apiVisitor.id,
  fingerprint: apiVisitor.fingerprint,
  lifecycle: 'ANON' as const,
  isNewVisitor: false,
  status: apiVisitor.connectionStatus === 'ONLINE' ? 'online' as const : 'offline' as const,
  currentUrl: apiVisitor.currentUrl, // ⬅️ NUEVO: Mapear currentUrl desde el backend
  domain: apiVisitor.siteName,
  siteId: apiVisitor.siteId,
  // ... resto del mapeo
}));
```

## Pendiente: Actualización del Backend ⚠️

Para que la solución funcione completamente, el backend debe incluir el campo `currentUrl` en la respuesta del endpoint:

### Endpoint a actualizar
`GET /tenant-visitors/:tenantId/visitors`

### Cambio requerido en la respuesta

```json
{
  "tenantId": "550e8400-e29b-41d4-a716-446655440001",
  "companyName": "MyTech Solutions",
  "visitors": [
    {
      "id": "visitor-uuid-123",
      "fingerprint": "fp-abc123",
      "connectionStatus": "ONLINE",
      "siteId": "site-uuid-456",
      "siteName": "autopractik.es",
      "currentUrl": "https://autopractik.es/cursos/b-permiso", // ⬅️ AGREGAR ESTE CAMPO
      "createdAt": "2025-10-07T10:00:00Z",
      "lastActivity": "2025-10-07T10:30:00Z",
      "pendingChatIds": []
    }
  ],
  "totalCount": 1,
  "activeSitesCount": 1,
  "timestamp": "2025-10-07T10:30:00Z"
}
```

### Recomendaciones para el Backend

1. **Obtener currentUrl**: El backend debería obtener la última URL registrada en el heartbeat o tracking del visitante
2. **Campo opcional**: Mantener `currentUrl` como opcional para mantener retrocompatibilidad
3. **Fallback**: Si no hay URL actual disponible, el campo puede ser `null` o no incluirse
4. **Considerar**: Agregar también `currentPageTitle` para mostrar el título de la página

## Comportamiento Actual vs Esperado

### Antes (comportamiento actual)
```
Visitante: autopractik.es
Actividad: autopractik.es  ❌ Información duplicada
```

### Después (con backend actualizado)
```
Visitante: autopractik.es
Actividad: https://autopractik.es/cursos/b-permiso  ✅ Información específica
```

### Transición (sin backend actualizado)
```
Visitante: autopractik.es
Actividad: autopractik.es  ℹ️ Fallback al dominio (funciona, pero no óptimo)
```

## Testing

### Casos de prueba recomendados

1. **Visitante con currentUrl**: Verificar que se muestra la URL completa en la sección de actividad
2. **Visitante sin currentUrl**: Verificar que se muestra el dominio como fallback
3. **Visitante con currentUrl muy larga**: Verificar el truncado CSS en el template
4. **Diferentes visitantes**: Asegurar que cada uno muestra su propia URL actual

## Archivos Modificados

1. ✅ `libs/chat/ui/visitors-list/src/lib/visitors-list/visitors-list.html`
2. ✅ `libs/shared/types/src/lib/visitor.types.ts`
3. ✅ `libs/chat/data-access/visitors-data-service/src/lib/visitors-data-service.ts`

## Estado

- ✅ **Frontend**: Completamente preparado para recibir `currentUrl`
- ⚠️ **Backend**: Pendiente de implementar el campo `currentUrl` en la respuesta
- ✅ **Tipos**: Actualizados para incluir el nuevo campo opcional
- ✅ **Compilación**: Sin errores

## Próximos Pasos

1. **Backend**: Implementar el campo `currentUrl` en el endpoint `/tenant-visitors/:tenantId/visitors`
2. **Testing**: Probar la integración una vez el backend esté actualizado
3. **UX**: Considerar agregar tooltips para URLs muy largas
4. **Opcional**: Agregar también `currentPageTitle` para mejor contexto
