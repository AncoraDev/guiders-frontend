# ANÁLISIS COMPLETO: GESTIÓN DE CONTADORES DE MENSAJES NO LEÍDOS

## 1. FLUJO DE RECEPCIÓN DEL EVENTO `message:new` WEBSOCKET

### Ubicación del Handler
- **Archivo**: `/Users/rogerpugaruiz/Proyectos/guiders-frontend/libs/chat/data-access/websocket-service/src/lib/websocket.service.ts`
- **Línea**: 526-533

### Código del Event Listener
```typescript
this.socket.on('message:new', (message: Message) => {
  console.log('📨 [WebSocket] Nuevo mensaje recibido');
  console.log('   💬 Chat ID:', message.chatId);
  console.log('   👤 Sender ID:', message.senderId);
  console.log('   📝 Content:', message.content?.substring(0, 50) + ...);
  this.messageReceivedSubject.next(message);
});
```

### Flujo de Propagación
1. WebSocketService escucha en `message:new` (línea 527)
2. Emite a través de `messageReceivedSubject` (línea 532)
3. Observable público: `messageReceived$` (línea 68)
4. UnreadMessagesService se suscribe a este observable (línea 639)

---

## 2. PROCESAMIENTO EN UnreadMessagesService

### Ubicación Principal del Servicio
- **Archivo**: `/Users/rogerpugaruiz/Proyectos/guiders-frontend/libs/chat/data-access/unread-messages-service/src/lib/unread-messages.service.ts`
- **Líneas clave**: 1-1418 (archivo completo)

### Flujo de Inicialización
1. **Línea 136**: `initializeWebSocketListeners()` se llama en constructor
2. **Línea 639-789**: Suscripción a `webSocket.messageReceived$`
3. **Línea 656-666**: Filtro: ignorar mensajes propios (comparar `senderId === currentUserId`)
4. **Línea 672-789**: Procesamiento del mensaje

### Lógica de Procesamiento de `message:new`

#### a) Verificación de Chat Activo (línea 672-689)
```typescript
const isFromActiveChat = message.chatId === this.activeChatId;
```

#### b) Si es del chat activo (línea 701-745):
- Espera 1 segundo
- Llama automáticamente a `markAsRead()` con el messageId
- NO incrementa el contador
- NO muestra notificación

#### c) Si NO es del chat activo (línea 747-788):
1. Incrementa contador: `incrementUnreadCount(message.chatId)` (línea 755)
2. Agrega a lista no leída: `addUnreadMessage(message)` (línea 762)
3. Muestra notificación del navegador: `showBrowserNotification(message)` (línea 774)
4. Inicia parpadeo del título: `startTitleFlashing()` (línea 784)

---

## 3. ESTRUCTURA DE DATOS DEL PAYLOAD `message:new`

### Tipo TypeScript: `Message`
**Ubicación**: `/Users/rogerpugaruiz/Proyectos/guiders-frontend/libs/shared/types/src/lib/chat.types.ts` (líneas 11-48)

```typescript
export interface Message {
  messageId: string;              // API usa messageId
  chatId: string;                 // ID del chat donde se envió
  senderId: string;               // ID del usuario que envió
  senderType: 'COMMERCIAL' | 'VISITOR' | 'SYSTEM';
  content: string;                // Contenido del mensaje
  type: 'TEXT' | 'IMAGE' | 'FILE' | 'AUDIO' | 'VIDEO' | 'SYSTEM' | 'AI';
  sentAt: Date;                   // API usa sentAt
  status: 'SENT' | 'DELIVERED' | 'READ';
  isRead?: boolean;               // Indica si fue leído
  readAt?: Date | null;           // Cuándo fue leído
  readBy?: string | null;         // Quién lo leyó
  isInternal?: boolean;           // Mensaje interno (solo comerciales)
  isFirstResponse?: boolean;      // Primer mensaje de respuesta del comercial
  replyTo?: string;               // ID del mensaje al que responde
  edited?: boolean;               // Si fue editado
  editedAt?: Date;               // Cuándo fue editado
  // Campos de IA
  isAI?: boolean;
  aiMetadata?: { ... };
  // Metadatos de archivo
  metadata?: { ... };
}
```

---

## 4. BADGE EN SIDEBAR (Aside Nav)

### Ubicación del Componente
- **Archivo**: `/Users/rogerpugaruiz/Proyectos/guiders-frontend/apps/console/src/app/app.ts`
- **Líneas**: 61-98

### Cómo obtiene los datos
```typescript
readonly sidebarItems = computed<SidebarItem[]>(() => {
  // Línea 63: Lee el total de mensajes no leídos
  const totalUnread = this.unreadMessagesService.totalUnreadCount();
  
  // Línea 64: Lee contadores de escalaciones
  const escalationCount = this.escalationService.escalationCount();

  return [
    {
      id: 'inbox',
      label: 'Bandeja de Entrada',
      icon: 'inbox',
      route: '/inbox',
      // Línea 72-77: Crea badge si hay mensajes no leídos
      ...(totalUnread > 0 && {
        badge: {
          text: totalUnread > 99 ? '99+' : totalUnread.toString(),
          variant: 'danger' as const
        }
      })
    },
    // ... más items
  ];
});
```

### Fuente del Dato
- **Línea 20**: inyecta `UnreadMessagesService`
- **Línea 63**: accede a `totalUnreadCount()` (un `computed()`)
- **Ubicación de computed**: `unread-messages.service.ts` líneas 68-71

```typescript
readonly totalUnreadCount = computed(() => {
  const counts = this.unreadCountMap();
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
});
```

### Tipo de Actualización
- **Signal reactivo** (computed basado en signal `unreadCountMap`)
- **Automático**: No requiere HTTP polling
- **Tiempo real**: Se actualiza cuando llega `message:new` vía WebSocket

---

## 5. BADGE EN COLUMNA "ACTIVIDAD" - LISTA DE VISITANTES

### Ubicación del Componente
- **Archivo**: `/Users/rogerpugaruiz/Proyectos/guiders-frontend/libs/chat/ui/visitors-list/src/lib/visitors-list/visitors-list.ts`
- **Ubicación del método**: línea 792-794

### Método que verifica si hay no leídos
```typescript
hasUnreadMessages(visitorId: string): boolean {
  return this.unreadVisitorIds().has(visitorId);
}
```

### Template HTML (donde se usa)
- **Archivo**: `/Users/rogerpugaruiz/Proyectos/guiders-frontend/libs/chat/ui/visitors-list/src/lib/visitors-list/visitors-list.html`
- **Línea**: 380-382

```html
@if (hasUnreadMessages(visitor.id)) {
  <span class="unread-dot" title="Mensajes sin leer"></span>
}
```

### Ubicación exacta en tabla
- Columna: "Actividad" (encabezado en línea 119-139)
- Dentro de: "activity-stats" (línea 373)
- Dentro de: "stat-badge stat-badge--chats" (línea 375)
- Se muestra como: un pequeño punto de color (`unread-dot`) junto al contador de chats

### Fuente del Dato
- **Línea 63** (input): `readonly unreadVisitorIds = input<Set<string>>(new Set());`
- **Proveedor**: Componente padre (VisitorsComponent) en `visitors.ts`
- **Ubicación del computed**: `visitors.ts` líneas 1805-1817

```typescript
readonly unreadVisitorIds = computed<Set<string>>(() => {
  // Rastrear visitantes que tienen no leídos
  const visitors = this.state().visitors;
  const unreadByVisitor = this.unreadMessagesService.unreadCountByVisitor();
  
  const ids = new Set<string>();
  for (const v of visitors) {
    if ((unreadByVisitor[v.id] || 0) > 0) {
      ids.add(v.id);
    }
  }
  return ids;
});
```

---

## 6. ENDPOINT PARA MARCAR COMO LEÍDO

### URL y Método HTTP
- **Método**: `PUT`
- **URL**: `/v2/messages/mark-as-read`
- **Base URL**: `${this.environment.api.baseUrl}/v2`

### Request Payload
```typescript
export interface MarkAsReadRequest {
  messageIds: string[];
}
```

### Response
```typescript
export interface MarkAsReadResponse {
  success: boolean;
  markedCount: number;
}
```

### Implementación en Frontend

#### a) En UnreadMessagesService (línea 503-534)
```typescript
markAsRead(messageIds: string[]): Observable<MarkAsReadResponse> {
  if (messageIds.length === 0) {
    return of({ success: true, markedCount: 0 });
  }

  return this.http
    .put<MarkAsReadResponse>(
      `${this.baseUrl}/messages/mark-as-read`,
      { messageIds },
      this.getHttpOptions()
    )
    .pipe(
      map((response) => {
        // Actualizar estado local: remover mensajes marcados
        this.removeMarkedMessages(messageIds);
        return response;
      }),
      catchError((error) => {
        this.error.set('Error al marcar mensajes como leídos');
        return of({ success: false, markedCount: 0 });
      })
    );
}
```

#### b) En ChatService (también existe duplicado)
- **Archivo**: `/Users/rogerpugaruiz/Proyectos/guiders-frontend/libs/chat/data-access/chat-service/src/lib/chat.service.ts`
- **Línea**: 809-825

#### c) HTTP Options (línea 923-928)
```typescript
private getHttpOptions(): { headers: HttpHeaders; withCredentials: boolean } {
  return {
    headers: this.getHeaders(),
    withCredentials: true,  // Incluye credenciales (cookies)
  };
}
```

---

## 7. SERVICIO DE WEBSOCKET

### Ubicación
- **Archivo**: `/Users/rogerpugaruiz/Proyectos/guiders-frontend/libs/chat/data-access/websocket-service/src/lib/websocket.service.ts`
- **Líneas**: 1-679

### Eventos que emite/escucha

| Evento | Dirección | Descripción |
|--------|-----------|-------------|
| `message:new` | Recibir (Línea 527) | Nuevo mensaje en tiempo real |
| `chat:join` | Enviar (Línea 360) | Unirse a una sala de chat |
| `chat:status` | Recibir (Línea 540) | Cambio de estado del chat |
| `presence:join` | Enviar (Línea 385) | Unirse a sala de presencia |
| `presence:changed` | Recibir (Nota: línea 535-537) | Cambio de presencia de usuario |
| `connect` | Recibir (Línea 470) | Conexión exitosa |
| `disconnect` | Recibir (Línea 509) | Desconexión |
| `reconnect` | Recibir (Línea 567) | Reconexión exitosa |

### Públicos Observables
```typescript
readonly messageReceived$: Observable<Message | null>
readonly chatStatus$: Observable<ChatStatusUpdate | null>
readonly connectionState$: Observable<'connected' | 'disconnected' | 'connecting'>
readonly tenantJoined$: Observable<TenantJoinedEvent>
readonly welcome$: Observable<WelcomeEvent>
readonly error$: Observable<WebSocketErrorEvent>
```

---

## 8. ESTADO DE NO LEÍDOS EN EL SERVICIO

### Signals (Reactivos)
```typescript
// Línea 57: Mapa de contadores por chatId
readonly unreadCountMap = signal<UnreadCountMap>({});
// Estructura: { 'chat-id-1': 5, 'chat-id-2': 0, ... }

// Línea 63: Mensajes no leídos por chatId
readonly unreadMessagesMap = signal<Record<string, Message[]>>({});

// Línea 68-71: Total de todos los chats
readonly totalUnreadCount = computed(() => {
  const counts = this.unreadCountMap();
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
});

// Línea 88-101: Agrupado por visitante
readonly unreadCountByVisitor = computed(() => {
  // Transforma { 'chat-id': count } a { 'visitor-id': count }
});
```

### BehaviorSubject (Para compatibilidad con observables legacy)
```typescript
// Línea 114-115: Observable alternativo
private readonly unreadCountSubject = new BehaviorSubject<UnreadCountMap>({});
readonly unreadCount$ = this.unreadCountSubject.asObservable();
```

---

## 9. CÓMO UTILIZA EL INBOX

### Ubicación
- **Archivo**: `/Users/rogerpugaruiz/Proyectos/guiders-frontend/libs/chat/features/inbox/src/lib/inbox/inbox.ts`

### Inicialización (línea 233)
```typescript
const user = await this.sessionService.ensureSession$().toPromise();
this.unreadMessagesService.setCurrentUser(user!.sub);
```

### Cuando se abre una conversación (línea 443)
```typescript
this.unreadMessagesService.setActiveChat(conversation.chatId);
// Esto hace que automáticamente marque como leído cuando llega un message:new
```

### Cuando se cierra una conversación (línea 497)
```typescript
this.unreadMessagesService.setActiveChat(null);
```

### Sincronización de contadores (línea 758-787)
```typescript
this.unreadMessagesService.unreadCount$
  .pipe(takeUntilDestroyed(this.destroyRef))
  .subscribe((unreadCountMap) => {
    // Actualiza cada chat con su nuevo unreadCount
    this.conversations.update((chats) => {
      return chats.map((chat) => ({
        ...chat,
        unreadCount: unreadCountMap[chat.chatId] || 0,
      }));
    });
  });
```

---

## 10. BADGE DE MENSAJES NO LEÍDOS (Componente UI)

### Ubicación
- **Archivo**: `/Users/rogerpugaruiz/Proyectos/guiders-frontend/libs/chat/ui/unread-badge/src/lib/unread-badge/unread-badge.ts`

### Propiedades
```typescript
readonly count = input<number>(0);                    // Número a mostrar
readonly size = input<'small' | 'medium' | 'large'> // Tamaño
readonly variant = input<'primary' | 'danger' | ...> // Color
readonly noPulse = input<boolean>(false);            // Desactivar animación
```

### Lógica de visualización
```typescript
readonly shouldShow = computed(() => this.count() > 0);

readonly displayText = computed(() => {
  const count = this.count();
  return count > 99 ? '99+' : count.toString();
});
```

---

## 11. CARGA INICIAL DE CHATS (Para los badges)

### En Inbox (línea 380-410)
```typescript
private loadChats(): void {
  this.chatService.getUserChats().subscribe((response) => {
    const chats = response.chats;
    const chatsToRegister = chats.map(c => ({
      chatId: c.chatId,
      visitorId: c.visitorId
    }));
    
    // Registra las relaciones para el badge de visitantes
    this.unreadMessagesService.registerChatsVisitors(chatsToRegister);
    
    // Carga los contadores iniciales
    const chatIds = chats.map(c => c.chatId);
    this.unreadMessagesService.refreshUnreadCounts(chatIds);
  });
}
```

### En Visitantes (línea 1756-1802)
```typescript
private loadCommercialChatsForBadges(): void {
  this.chatService.getCommercialChats(userId).subscribe((chats) => {
    const chatsToRegister = chats.map((chat) => ({
      chatId: chat.chatId,
      visitorId: chat.visitorId,
    }));
    
    this.unreadMessagesService.registerChatsVisitors(chatsToRegister);
  });
}
```

---

## RESUMEN DE FLUJO COMPLETO

```
1. Usuario abre la aplicación
   ↓
2. Inbox carga chats del usuario
   └→ Registra relaciones chat-visitor en UnreadMessagesService
   └→ Carga contadores iniciales vía GET /v2/messages/chat/{chatId}/unread
   
3. Usuario selecciona una conversación
   ↓
4. Se llama setActiveChat(chatId)
   
5. Servidor envía mensaje vía WebSocket (message:new)
   ↓
6. WebSocketService recibe y emite a messageReceived$
   ↓
7. UnreadMessagesService se suscribe:
   
   a) Si es del chat activo:
      - Espera 1 segundo
      - Marca automáticamente como leído (PUT /v2/messages/mark-as-read)
      - NO incrementa el contador
      
   b) Si NO es del chat activo:
      - Incrementa unreadCountMap[chatId]
      - totalUnreadCount se recalcula automáticamente
      - Sidebar badge se actualiza automáticamente
      - unreadCountByVisitor se recalcula
      - Visitantes badge se actualiza automáticamente
      
8. Usuario ve:
   - Badge rojo en sidebar "Bandeja de Entrada"
   - Punto en columna "Actividad" de visitantes
   - Contador de no leídos en cada conversación del Inbox
```

---

## CAMBIOS ESPERADOS CUANDO SE IMPLEMENTE `unreadMessagesCount`

El backend enviará en el payload de `message:new`:
```json
{
  "messageId": "...",
  "chatId": "...",
  "unreadMessagesCount": 5,  // ← NUEVO CAMPO
  "... otros campos"
}
```

El frontend podrá entonces:
1. Extraer directamente `unreadMessagesCount` del evento
2. NO necesitar hacer un GET adicional para refrescar el contador
3. Actualizar `unreadCountMap[chatId]` con el nuevo valor del servidor
4. Todo lo demás se actualiza automáticamente vía signals
