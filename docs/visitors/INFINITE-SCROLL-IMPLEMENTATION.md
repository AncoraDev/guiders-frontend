# Implementación de Scroll Infinito para Mensajes de Chat

## 📋 Resumen

Implementación completa de scroll infinito para la carga de mensajes de chat usando el endpoint V2 con paginación basada en cursor. Los usuarios pueden hacer scroll hacia arriba para cargar mensajes antiguos automáticamente.

---

## 🎯 Características Implementadas

### 1. **Paginación con Cursor (Endpoint V2)**
- ✅ Uso del endpoint `/api/v2/messages/chat/:chatId` con soporte completo de paginación
- ✅ Respuesta incluye: `messages`, `total`, `hasMore`, `nextCursor`
- ✅ Previene duplicados y omisiones al insertar mensajes nuevos

### 2. **Scroll Infinito Inteligente**
- ✅ **IntersectionObserver** detecta cuando el usuario llega al inicio del contenedor
- ✅ Carga automática de mensajes antiguos al hacer scroll hacia arriba
- ✅ **Preservación de posición del scroll** al insertar mensajes antiguos
- ✅ Scroll automático al final para mensajes nuevos

### 3. **Estados de Carga**
- ✅ Indicador visual de "Cargando mensajes anteriores…"
- ✅ Spinner animado durante la carga
- ✅ Manejo de estado `isLoadingMore` para evitar cargas duplicadas

### 4. **UX Optimizada**
- ✅ Smooth scrolling sin saltos bruscos
- ✅ Los mensajes siempre se muestran en orden cronológico (antiguos arriba, recientes abajo)
- ✅ Compatibilidad con OnPush change detection strategy

---

## 📁 Archivos Modificados

### 1. **Tipos** (`libs/shared/types/src/lib/chat.types.ts`)

```typescript
// Nuevas interfaces para respuesta paginada V2
export interface MessageListResponse {
  messages: Message[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
}

export interface MessagePaginationInfo {
  total: number;
  hasMore: boolean;
  nextCursor?: string;
}
```

**Cambios:**
- Agregadas interfaces para manejar la respuesta del endpoint V2
- Compatible con la guía del backend

---

### 2. **Servicio de Chat** (`libs/chat/data-access/chat-service/src/lib/chat.service.ts`)

```typescript
/**
 * Obtener mensajes de un chat con el endpoint V2 (incluye paginación completa)
 */
getMessagesV2(chatId: string, options?: {
  cursor?: string;
  limit?: number;
  filters?: { /* ... */ };
  sort?: { /* ... */ };
}): Observable<MessageListResponse>
```

**Características:**
- Nuevo método `getMessagesV2` que retorna la respuesta completa con paginación
- Soporte para todos los filtros del endpoint V2: `types`, `dateFrom`, `dateTo`, `senderId`, `senderType`, `isRead`, `hasAttachments`, `keyword`
- Ordenamiento configurable (`sentAt`, `readAt`, `type` + `ASC`/`DESC`)
- Mantiene compatibilidad con el método anterior `getMessages`

**Nota:** El endpoint V2 devuelve mensajes en orden **descendente** (más recientes primero) por defecto.

---

### 3. **Componente Chat Placeholder** (`libs/chat/ui/chat-placeholder/`)

#### TypeScript (`chat-placeholder.ts`)

**Nuevos Inputs:**
```typescript
@Input() isLoadingMore = false;      // Loading para scroll infinito
@Input() hasMoreMessages = false;    // Indica si hay más mensajes antiguos
```

**Nuevos Outputs:**
```typescript
@Output() loadMoreMessages = new EventEmitter<void>(); // Evento para cargar más
```

**Nuevos ViewChild:**
```typescript
@ViewChild('scrollAnchor') private scrollAnchor?: ElementRef<HTMLDivElement>;
```

**Propiedades privadas:**
```typescript
private intersectionObserver?: IntersectionObserver;
private shouldScrollToBottom = true;
private previousScrollHeight = 0;
```

**Métodos clave:**

1. **`setupIntersectionObserver()`**: Configura el observer para detectar cuando el scroll anchor es visible
2. **`preserveScrollPosition()`**: Ajusta el scroll al insertar mensajes antiguos para que no haya saltos
3. **`ngOnChanges()`**: Detecta si los mensajes nuevos son al final (scroll down) o al inicio (scroll infinito)

#### HTML (`chat-placeholder.html`)

```html
<!-- Anchor para scroll infinito -->
@if (hasMoreMessages) {
  <div #scrollAnchor class="guiders-chat-placeholder__scroll-anchor">
    @if (isLoadingMore) {
      <div class="guiders-chat-placeholder__loading-more">
        <span class="guiders-chat-placeholder__loading-spinner"></span>
        <span class="guiders-chat-placeholder__loading-text">
          Cargando mensajes anteriores…
        </span>
      </div>
    }
  </div>
}
```

**Ubicación:** Al inicio del contenedor de mensajes, antes del loop `@for`

#### SCSS (`chat-placeholder.scss`)

```scss
&__scroll-anchor {
  min-height: 1px;
  padding: tokens.$spacing-sm 0;
}

&__loading-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: tokens.$spacing-sm;
  padding: tokens.$spacing-md;
  color: tokens.$color-text-secondary;
}

&__loading-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid tokens.$color-border-default;
  border-top-color: tokens.$color-primary-500;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

---

### 4. **Feature Inbox** (`libs/chat/features/inbox/src/lib/inbox/`)

#### TypeScript (`inbox.ts`)

**Nuevo estado de paginación:**
```typescript
readonly messagePaginationMap = signal<Record<string, {
  total: number;
  hasMore: boolean;
  nextCursor?: string;
  isLoadingMore: boolean;
}>>({});

readonly currentPagination = computed(() => {
  const chatId = this.selectedConversationId();
  if (!chatId) return { total: 0, hasMore: false, isLoadingMore: false };
  return this.messagePaginationMap()[chatId] ?? { 
    total: 0, hasMore: false, isLoadingMore: false 
  };
});
```

**Método actualizado `loadMessages()`:**
```typescript
private loadMessages(chatId: string): void {
  this.chatService.getMessagesV2(chatId, {
    limit: 50,
    sort: { field: 'sentAt', direction: 'DESC' }
  }).subscribe({
    next: (response) => {
      // Revertir orden: DESC → ASC para mostrar cronológicamente
      const messages = [...response.messages].reverse();
      
      this.messagesMap.update(map => ({
        ...map,
        [chatId]: messages
      }));
      
      this.messagePaginationMap.update(map => ({
        ...map,
        [chatId]: {
          total: response.total,
          hasMore: response.hasMore,
          nextCursor: response.nextCursor,
          isLoadingMore: false
        }
      }));
    }
  });
}
```

**Nuevo método `onLoadMoreMessages()`:**
```typescript
onLoadMoreMessages(): void {
  const chatId = this.selectedConversationId();
  const pagination = this.messagePaginationMap()[chatId];
  
  if (!pagination?.hasMore || pagination.isLoadingMore) return;

  // Marcar como cargando
  this.messagePaginationMap.update(map => ({
    ...map,
    [chatId]: { ...map[chatId], isLoadingMore: true }
  }));

  this.chatService.getMessagesV2(chatId, {
    cursor: pagination.nextCursor,
    limit: 50,
    sort: { field: 'sentAt', direction: 'DESC' }
  }).subscribe({
    next: (response) => {
      const newMessages = [...response.messages].reverse();
      const currentMessages = this.messagesMap()[chatId] || [];
      
      // Insertar mensajes antiguos AL INICIO
      this.messagesMap.update(map => ({
        ...map,
        [chatId]: [...newMessages, ...currentMessages]
      }));
      
      // Actualizar paginación
      this.messagePaginationMap.update(/* ... */);
    }
  });
}
```

#### HTML (`inbox.html`)

```html
<guiders-chat-placeholder
  [selectedChat]="selectedChat()!"
  [messages]="currentMessages()"
  [currentUserId]="currentUserId()"
  [isLoading]="isLoading()"
  [isLoadingMore]="currentPagination().isLoadingMore"
  [hasMoreMessages]="currentPagination().hasMore"
  (loadMoreMessages)="onLoadMoreMessages()"
  <!-- ... otros inputs/outputs -->
/>
```

---

## 🔄 Flujo de Datos

### 1. **Carga Inicial de Mensajes**

```
Usuario selecciona chat
    ↓
Inbox.onUserSelected(chat)
    ↓
Inbox.loadMessages(chatId)
    ↓
ChatService.getMessagesV2(chatId, { limit: 50, sort: DESC })
    ↓
Backend responde: { messages: [...], total: 150, hasMore: true, nextCursor: "abc123" }
    ↓
Inbox transforma: messages.reverse() (DESC → ASC)
    ↓
Inbox actualiza signals:
  - messagesMap[chatId] = messages (orden ASC)
  - messagePaginationMap[chatId] = { total: 150, hasMore: true, nextCursor: "abc123" }
    ↓
ChatPlaceholder recibe:
  - messages (50 mensajes más recientes en orden ASC)
  - hasMoreMessages = true
    ↓
ChatPlaceholder hace scroll al final automáticamente
```

### 2. **Scroll Infinito (Carga de Mensajes Antiguos)**

```
Usuario hace scroll hacia arriba
    ↓
IntersectionObserver detecta scrollAnchor visible
    ↓
ChatPlaceholder.loadMoreMessages.emit()
    ↓
Inbox.onLoadMoreMessages()
    ↓
Inbox marca isLoadingMore = true
    ↓
ChatPlaceholder muestra spinner
    ↓
ChatService.getMessagesV2(chatId, { cursor: "abc123", limit: 50, sort: DESC })
    ↓
Backend responde: { messages: [...], total: 150, hasMore: true, nextCursor: "def456" }
    ↓
Inbox transforma: newMessages.reverse()
    ↓
Inbox inserta al INICIO: [...newMessages, ...currentMessages]
    ↓
ChatPlaceholder.preserveScrollPosition()
  - Guarda scrollHeight antes
  - Detecta cambios
  - Ajusta scrollTop para compensar nuevos mensajes
    ↓
Usuario ve mensajes antiguos SIN salto de scroll
```

### 3. **Mensaje Nuevo en Tiempo Real**

```
WebSocket recibe mensaje nuevo
    ↓
ChatService.messageReceived$ emite mensaje
    ↓
Inbox actualiza messagesMap: [...currentMessages, newMessage]
    ↓
ChatPlaceholder detecta cambio en ngOnChanges:
  - Último mensaje es diferente → mensaje nuevo al final
  - shouldScrollToBottom = true
    ↓
ChatPlaceholder hace scroll al final automáticamente
```

---

## 🎨 Diseño Visual

### Estado Normal
```
┌─────────────────────────────────────┐
│  Chat con Usuario X          [⚙] [✕] │
│  ● Activo                            │
├─────────────────────────────────────┤
│                                      │
│  [Mensajes cargados dinámicamente]  │ ← Área con scroll
│                                      │
│  👤 Usuario: Hola                    │
│  🔷 Tú: ¿En qué puedo ayudarte?     │
│  👤 Usuario: Tengo una consulta     │
│                                      │
├─────────────────────────────────────┤
│  [Enviar mensaje...]          [→]   │
└─────────────────────────────────────┘
```

### Scroll Infinito Activo
```
┌─────────────────────────────────────┐
│  Chat con Usuario X          [⚙] [✕] │
│  ● Activo                            │
├─────────────────────────────────────┤
│  ┌───────────────────────────────┐  │ ← Scroll Anchor
│  │ ⟳ Cargando mensajes anteriores… │  │ ← Spinner + Texto
│  └───────────────────────────────┘  │
│                                      │
│  👤 Usuario: Mensaje antiguo 1      │
│  🔷 Tú: Respuesta antigua 1         │
│  ...                                 │
│                                      │
├─────────────────────────────────────┤
│  [Enviar mensaje...]          [→]   │
└─────────────────────────────────────┘
```

---

## 🧪 Casos de Prueba

### 1. **Carga Inicial**
- [ ] Se cargan los 50 mensajes más recientes
- [ ] Los mensajes se muestran en orden cronológico (antiguos arriba)
- [ ] El scroll está al final automáticamente
- [ ] Se muestra el scroll anchor si `hasMore = true`

### 2. **Scroll Infinito**
- [ ] Al llegar al inicio, se cargan 50 mensajes antiguos adicionales
- [ ] La posición del scroll se preserva (sin saltos)
- [ ] Se muestra el spinner mientras carga
- [ ] El cursor se actualiza correctamente

### 3. **Mensajes Nuevos**
- [ ] Al recibir mensaje nuevo, se agrega al final
- [ ] El scroll se mueve automáticamente al final
- [ ] No se activa scroll infinito con mensajes nuevos

### 4. **Estados Límite**
- [ ] Si no hay más mensajes (`hasMore = false`), el scroll anchor no se muestra
- [ ] Si ya está cargando (`isLoadingMore = true`), no se dispara nueva carga
- [ ] Si hay error en la carga, `isLoadingMore` vuelve a `false`

### 5. **Cambio de Chat**
- [ ] Al cambiar de chat, se resetea el scroll al final
- [ ] La paginación se guarda por chat (cada chat tiene su propio cursor)
- [ ] El estado `isLoadingMore` es independiente por chat

---

## 🔧 Configuración del Endpoint V2

### URL
```
GET /api/v2/messages/chat/:chatId
```

### Parámetros Soportados

#### Paginación
- `cursor` (string, opcional): Cursor para siguiente página
- `limit` (number, opcional): Mensajes por página (1-100, default: 50)

#### Filtros
- `filters[types][]`: Tipos de mensaje (`text`, `image`, `file`, `system`)
- `filters[dateFrom]`: Fecha inicio (ISO 8601)
- `filters[dateTo]`: Fecha fin (ISO 8601)
- `filters[senderId]`: ID del remitente
- `filters[senderType]`: Tipo de remitente (`visitor`, `commercial`, `system`)
- `filters[isRead]`: Filtrar por leídos (`true`/`false`)
- `filters[hasAttachments]`: Filtrar por adjuntos (`true`/`false`)
- `filters[keyword]`: Búsqueda en contenido

#### Ordenamiento
- `sort[field]`: Campo (`sentAt`, `readAt`, `type`)
- `sort[direction]`: Dirección (`ASC`, `DESC`)

### Respuesta
```typescript
{
  messages: Message[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
}
```

---

## 📊 Rendimiento

### Optimizaciones Implementadas

1. **OnPush Change Detection**
   - Reduce ciclos de detección de cambios
   - `cdr.detectChanges()` solo cuando es necesario

2. **IntersectionObserver**
   - Más eficiente que eventos de scroll
   - Configurado con `rootMargin: '20px'` para pre-carga suave

3. **Paginación con Cursor**
   - Evita problemas de offset en datos cambiantes
   - Más eficiente que offset/limit tradicional

4. **Lazy Loading**
   - Solo se cargan mensajes cuando el usuario hace scroll
   - Límite de 50 mensajes por petición

5. **Track By Function**
   - `trackMessageById()` previene re-renders innecesarios
   - Angular reutiliza elementos del DOM

---

## 🚀 Próximos Pasos (Opcionales)

### Mejoras Futuras

1. **Scroll al Mensaje Específico**
   - Navegar a un mensaje por ID
   - Cargar contexto antes y después del mensaje

2. **Búsqueda de Mensajes**
   - Usar `filters[keyword]` del endpoint V2
   - Resaltar resultados en el chat

3. **Filtros Avanzados**
   - UI para filtrar por fecha, tipo, remitente
   - Vista de solo mensajes con adjuntos

4. **Virtualización**
   - Implementar scroll virtual para chats muy largos (1000+ mensajes)
   - Librerías: `@angular/cdk/scrolling`

5. **Caché Persistente**
   - Guardar mensajes en IndexedDB
   - Cargar desde caché mientras actualiza desde red

---

## 📚 Referencias

- **Guía del Endpoint V2**: `/docs/api-ai/endpoint-chat-with-message.md`
- **Design Tokens**: `libs/shared/design-tokens/src/lib/tokens-vars.scss`
- **Pattern BehaviorSubject**: Ver `chat.service.ts` línea 82
- **IntersectionObserver API**: [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)

---

## ✅ Checklist de Implementación

- [x] Agregar tipos `MessageListResponse` y `MessagePaginationInfo`
- [x] Crear método `getMessagesV2` en `ChatService`
- [x] Implementar `IntersectionObserver` en `ChatPlaceholder`
- [x] Agregar lógica de preservación de scroll
- [x] Actualizar `Inbox` con estado de paginación
- [x] Conectar eventos `loadMoreMessages`
- [x] Agregar estilos para loading spinner
- [x] Agregar scroll anchor en template HTML
- [x] Manejar estados de carga (`isLoadingMore`)
- [x] Implementar reversión de orden de mensajes (DESC → ASC)
- [x] Documentar implementación completa

---

**Última actualización**: 3 de octubre de 2025
**Versión**: 1.0
**Autor**: GitHub Copilot
