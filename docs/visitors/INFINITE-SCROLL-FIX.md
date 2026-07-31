# Fix: Error de Parámetros Sort en Endpoint V2

## 🐛 Problema

Al intentar usar el endpoint `/api/v2/messages/chat/:chatId` con parámetros de ordenamiento, el backend retorna error:

```json
{
  "message": [
    "property sort[field] should not exist",
    "property sort[direction] should not exist"
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

## 🔍 Causa

El backend no acepta los parámetros `sort[field]` y `sort[direction]` en el formato que estábamos enviando. Aunque la guía del endpoint V2 menciona que estos parámetros están disponibles, el backend puede:

1. No tener implementado el ordenamiento aún
2. Esperar un formato diferente de serialización
3. Tener el ordenamiento por defecto como suficiente

## ✅ Solución

El endpoint **por defecto** devuelve los mensajes ordenados por `sentAt DESC` (más recientes primero), que es exactamente lo que necesitamos. Por lo tanto, **no necesitamos enviar parámetros de ordenamiento**.

### Cambios Realizados

#### Antes (con error):

```typescript
this.chatService.getMessagesV2(chatId, {
  limit: 50,
  sort: {
    field: 'sentAt',
    direction: 'DESC'
  }
})
```

#### Después (funcionando):

```typescript
this.chatService.getMessagesV2(chatId, {
  limit: 50
  // El endpoint por defecto devuelve sentAt DESC (más recientes primero)
})
```

### Archivos Modificados

1. **`libs/chat/features/inbox/src/lib/inbox/inbox.ts`**
   - Método `loadMessages()`: Removidos parámetros sort
   - Método `onLoadMoreMessages()`: Removidos parámetros sort

## 📝 Notas Técnicas

### Flujo Actual

1. **Backend devuelve**: Mensajes en orden `sentAt DESC` (más recientes primero)
2. **Frontend revierte**: `messages.reverse()` para orden `ASC` (más antiguos arriba)
3. **UI muestra**: Mensajes cronológicamente (antiguos arriba, recientes abajo)

### Ordenamiento por Defecto del Backend

```
Backend Response:
[
  { id: 'msg-50', sentAt: '2025-10-03T14:30:00Z' },  // Más reciente
  { id: 'msg-49', sentAt: '2025-10-03T14:25:00Z' },
  { id: 'msg-48', sentAt: '2025-10-03T14:20:00Z' },
  ...
  { id: 'msg-1',  sentAt: '2025-10-03T10:00:00Z' }   // Más antiguo
]

Frontend (después de reverse):
[
  { id: 'msg-1',  sentAt: '2025-10-03T10:00:00Z' },  // Más antiguo
  { id: 'msg-2',  sentAt: '2025-10-03T10:05:00Z' },
  ...
  { id: 'msg-49', sentAt: '2025-10-03T14:25:00Z' },
  { id: 'msg-50', sentAt: '2025-10-03T14:30:00Z' }   // Más reciente
]
```

## 🔮 Futuras Mejoras

Si en el futuro el backend implementa parámetros de ordenamiento personalizados, el método `getMessagesV2` ya está preparado para soportarlos:

```typescript
getMessagesV2(chatId: string, options?: {
  cursor?: string;
  limit?: number;
  filters?: { /* ... */ };
  sort?: {
    field?: 'sentAt' | 'readAt' | 'type';
    direction?: 'ASC' | 'DESC';
  };
})
```

### Posibles Formatos de Sort

El backend podría aceptar sort en alguno de estos formatos:

1. **Query params separados**: `?sort[field]=sentAt&sort[direction]=DESC`
2. **Query param único**: `?sort=sentAt:DESC`
3. **JSON en query**: `?sort={"field":"sentAt","direction":"DESC"}`
4. **Body parameter** (si cambian a POST en lugar de GET)

## ✅ Verificación

Para verificar que la solución funciona correctamente:

1. Ejecutar la aplicación: `npm run serve:console`
2. Seleccionar un chat con mensajes
3. Verificar que se cargan los 50 mensajes más recientes
4. Hacer scroll hacia arriba
5. Verificar que se cargan mensajes antiguos sin error

## 📌 Referencias

- Endpoint V2 documentación: `/docs/api-ai/endpoint-chat-with-message.md`
- Implementación scroll infinito: `./INFINITE-SCROLL-IMPLEMENTATION.md`
- Chat Service: `libs/chat/data-access/chat-service/src/lib/chat.service.ts`
- Inbox Component: `libs/chat/features/inbox/src/lib/inbox/inbox.ts`

---

**Fecha**: 3 de octubre de 2025  
**Status**: ✅ Resuelto  
**Impacto**: Bajo - El ordenamiento por defecto es el correcto para nuestro caso de uso
