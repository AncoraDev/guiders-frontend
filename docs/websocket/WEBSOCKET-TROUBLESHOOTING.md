# WebSocket Troubleshooting Guide

## Error: "Invalid namespace"

### Descripción del Problema

```
[WebSocket] Error de conexión: Invalid namespace
```

Este error ocurre cuando Socket.IO intenta conectarse a un namespace que no existe en el servidor.

### Causa Raíz

El error "Invalid namespace" típicamente ocurre por uno de estos motivos:

1. **URL incorrecta**: Socket.IO se conecta a `/api` en lugar de la raíz del servidor
2. **Namespace incorrecto**: El cliente intenta conectarse a un namespace diferente al configurado en el backend
3. **Path incorrecto**: El path de Socket.IO no coincide entre cliente y servidor

### Solución Implementada

#### Cambio 1: Variable de entorno específica para WebSocket

Agregamos `wsUrl` opcional en la configuración de environment:

```typescript
// libs/shared/types/src/lib/environment.interface.ts
export interface Environment {
  production: boolean;
  auth: { ... };
  api: {
    baseUrl: string;
    wsUrl?: string; // URL específica para WebSocket (opcional)
  };
}
```

#### Cambio 2: Configuración de environments

**Development** (`apps/console/src/environments/environment.ts`):
```typescript
export const environment: Environment = {
  production: false,
  auth: { ... },
  api: {
    baseUrl: 'http://localhost:3000/api',  // HTTP REST API
    wsUrl: 'http://localhost:3000'          // WebSocket (sin /api)
  }
};
```

**Staging** (`apps/console/src/environments/environment.staging.ts`):
```typescript
export const environment: Environment = {
  production: false,
  auth: { ... },
  api: {
    baseUrl: 'https://guiders.es/api',
    wsUrl: 'https://guiders.es'  // Sin /api
  }
};
```

**Production** (`apps/console/src/environments/environment.prod.ts`):
```typescript
export const environment: Environment = {
  production: true,
  auth: { ... },
  api: {
    baseUrl: 'https://guiders.es/api',
    wsUrl: 'https://guiders.es'  // Sin /api
  }
};
```

#### Cambio 3: Lógica de conexión en WebSocketService

Actualizado el método `connect()` con prioridad de URLs:

```typescript
// libs/chat/data-access/websocket-service/src/lib/websocket.service.ts
connect(config: WebSocketConfig = {}): void {
  // Prioridad de URLs:
  // 1. config.url (pasado manualmente)
  // 2. environment.api.wsUrl (configurado en environment)
  // 3. environment.api.baseUrl sin /api (fallback)
  
  let url: string;
  if (config.url) {
    url = config.url;
  } else if (this.environment.api.wsUrl) {
    url = this.environment.api.wsUrl;
  } else {
    // Fallback: remover /api del baseUrl
    const apiBaseUrl = this.environment.api.baseUrl || 'http://localhost:3000/api';
    url = apiBaseUrl.replace(/\/api$/, '');
  }
  
  const path = config.path || '/socket.io/';
  
  console.log('[WebSocket] Conectando a:', url, 'path:', path);
  
  this.socket = io(url, {
    path,
    transports: ['websocket', 'polling'],
    withCredentials: true,
    // ... resto de opciones
  });
}
```

### Cómo Verificar la Solución

#### 1. Verificar URL en DevTools Console

Cuando la app se conecta, deberías ver:

```
[WebSocket] Conectando a: http://localhost:3000 path: /socket.io/
✅ [WebSocket] Conectado - Socket ID: xyz123...
```

**✅ Correcto**: URL sin `/api`  
**❌ Incorrecto**: `http://localhost:3000/api` (con `/api`)

#### 2. Verificar en DevTools Network Tab

1. Abrir DevTools → Network
2. Filtrar por `WS` (WebSocket)
3. Buscar conexión a `localhost:3000` o `guiders.es`
4. Verificar que el Status sea `101 Switching Protocols`

**Ejemplo correcto**:
```
Name: socket.io/?EIO=4&transport=websocket
Status: 101 Switching Protocols
Type: websocket
```

#### 3. Verificar Headers de la Petición

En DevTools → Network → WebSocket connection → Headers:

```
Request URL: ws://localhost:3000/socket.io/?EIO=4&transport=websocket
Request Method: GET
Status Code: 101 Switching Protocols
```

**Importante**: La URL debe ser la raíz del servidor, NO `/api/socket.io/`

#### 4. Test Manual desde Código

```typescript
// En DevTools Console
const chatService = ng.getComponent($0).chatService;
const wsService = chatService.webSocketService;

// Verificar URL configurada
console.log('Environment:', wsService['environment'].api);
// Output esperado:
// {
//   baseUrl: "http://localhost:3000/api",
//   wsUrl: "http://localhost:3000"
// }

// Verificar conexión
console.log('Conectado:', wsService.isConnected());
console.log('Error:', wsService.connectionError());
```

### Otros Errores Comunes y Soluciones

#### Error: "CORS policy"

**Síntoma**:
```
Access to XMLHttpRequest at 'http://localhost:3000/socket.io/...' 
from origin 'http://localhost:4200' has been blocked by CORS policy
```

**Solución**: Backend debe configurar CORS correctamente:

```typescript
// Backend: main.ts
app.enableCors({
  origin: ['http://localhost:4200', 'http://localhost:4201'],
  credentials: true
});
```

#### Error: "Transport unknown"

**Síntoma**:
```
[WebSocket] Error de conexión: Transport unknown
```

**Causa**: El servidor no soporta los transportes especificados.

**Solución**: Verificar que el backend tenga Socket.IO configurado correctamente:

```typescript
// Backend: app.module.ts o gateway
@WebSocketGateway({
  cors: {
    origin: ['http://localhost:4200'],
    credentials: true
  },
  transports: ['websocket', 'polling']
})
```

#### Error: "Unauthorized"

**Síntoma**:
```
[WebSocket] Error de conexión: Unauthorized
```

**Causa**: Token JWT inválido o expirado.

**Solución**:

1. Verificar que el token esté en localStorage:
   ```typescript
   console.log('Token:', localStorage.getItem('access-token'));
   ```

2. Renovar token si está expirado
3. Reconectar WebSocket con nuevo token:
   ```typescript
   chatService.webSocketService.disconnect();
   chatService.webSocketService.connect({
     authToken: newToken
   });
   ```

#### Error: "connect_timeout"

**Síntoma**:
```
[WebSocket] Error de conexión: connect_timeout
```

**Causa**: El servidor no responde en el tiempo configurado.

**Soluciones**:

1. Verificar que el backend esté corriendo:
   ```bash
   curl http://localhost:3000/api/health
   ```

2. Verificar firewall/red
3. Aumentar timeout en configuración:
   ```typescript
   webSocket.connect({
     timeout: 20000 // 20 segundos
   });
   ```

### Configuración de Backend Esperada

Para que el frontend funcione correctamente, el backend debe tener:

#### Gateway de Socket.IO

```typescript
import { 
  WebSocketGateway, 
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect 
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:4200',  // console en dev
      'http://localhost:4201',  // admin en dev
      'https://guiders.es'      // producción
    ],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  path: '/socket.io/'  // Importante: debe coincidir con el cliente
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log('Cliente conectado:', client.id);
  }

  handleDisconnect(client: Socket) {
    console.log('Cliente desconectado:', client.id);
  }

  // Manejar eventos
  @SubscribeMessage('chat:join')
  handleJoinRoom(client: Socket, payload: { chatId: string }) {
    const roomId = `chat:${payload.chatId}`;
    client.join(roomId);
    console.log(`Cliente ${client.id} se unió a ${roomId}`);
  }

  @SubscribeMessage('chat:leave')
  handleLeaveRoom(client: Socket, payload: { chatId: string }) {
    const roomId = `chat:${payload.chatId}`;
    client.leave(roomId);
    console.log(`Cliente ${client.id} salió de ${roomId}`);
  }

  // Emitir mensaje a sala
  emitMessageToRoom(chatId: string, message: Message) {
    const roomId = `chat:${chatId}`;
    this.server.to(roomId).emit('message:new', message);
  }
}
```

#### Autenticación con JWT

```typescript
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

export class AuthenticatedSocketIoAdapter extends IoAdapter {
  constructor(private jwtService: JwtService) {
    super();
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);

    server.use((socket, next) => {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error'));
      }

      try {
        const payload = this.jwtService.verify(token);
        socket.data.user = payload;
        next();
      } catch (error) {
        next(new Error('Authentication error'));
      }
    });

    return server;
  }
}
```

### Checklist de Debugging

Cuando tengas problemas con WebSocket, sigue estos pasos:

- [ ] **Verificar backend está corriendo**
  ```bash
  curl http://localhost:3000/api/health
  ```

- [ ] **Verificar URL en logs del frontend**
  ```
  [WebSocket] Conectando a: http://localhost:3000 path: /socket.io/
  ```
  Debe ser sin `/api`

- [ ] **Verificar conexión en DevTools Network → WS**
  Status debe ser `101 Switching Protocols`

- [ ] **Verificar CORS en backend**
  Origin debe incluir `http://localhost:4200`

- [ ] **Verificar token JWT si aplica**
  ```typescript
  console.log('Token:', localStorage.getItem('access-token'));
  ```

- [ ] **Verificar eventos en backend**
  Logs deben mostrar: "Cliente conectado: xyz123..."

- [ ] **Verificar salas en backend**
  Logs deben mostrar: "Cliente xyz se unió a chat:abc..."

- [ ] **Test de reconexión**
  Detener backend, iniciar de nuevo, verificar que reconecta automáticamente

### Logs Esperados (Todo Funcionando Correctamente)

**Frontend (DevTools Console)**:
```
[WebSocket] Conectando a: http://localhost:3000 path: /socket.io/
✅ [WebSocket] Conectado - Socket ID: vQR2eS9Xhj_BpKaaAAAB
[WebSocket] Uniéndose a sala: chat:550e8400-e29b-41d4-a716-446655440000
📨 [WebSocket] Nuevo mensaje: { messageId: "...", content: "...", ... }
[ChatService] Mensaje recibido via WebSocket: { ... }
```

**Backend (Terminal)**:
```
[Nest] 12345  - 10/03/2025, 14:30:00     LOG [ChatGateway] Cliente conectado: vQR2eS9Xhj_BpKaaAAAB
[Nest] 12345  - 10/03/2025, 14:30:02     LOG [ChatGateway] Cliente vQR2eS9Xhj_BpKaaAAAB se unió a chat:550e8400-e29b-41d4-a716-446655440000
[Nest] 12345  - 10/03/2025, 14:30:05     LOG [ChatGateway] Emitiendo mensaje a chat:550e8400-e29b-41d4-a716-446655440000
```

### Referencias

- [Socket.IO Client Documentation](https://socket.io/docs/v4/client-api/)
- [Socket.IO Server Documentation](https://socket.io/docs/v4/server-api/)
- [NestJS WebSockets](https://docs.nestjs.com/websockets/gateways)
- [WebSocket Troubleshooting](https://socket.io/docs/v4/troubleshooting-connection-issues/)

---

**Última actualización**: 3 de octubre de 2025  
**Versión**: 1.1.0 - Fix para "Invalid namespace"
