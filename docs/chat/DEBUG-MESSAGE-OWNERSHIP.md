# Debug: Detección de Mensajes Propios vs Otros

## 🐛 Problema Reportado

Los mensajes no se están clasificando correctamente como "propios" o "de otros" en el chat widget.

## 🔍 Análisis del Código Actual

### Comparación en el Template
```html
@let isOwn = message.senderId === currentUserId();
```

### Obtención del User ID
1. Se inicializa en el constructor:
   ```typescript
   readonly currentUserId = signal<string | null>(this.chatService.getCurrentUserId());
   ```

2. El servicio lo obtiene del JWT token:
   ```typescript
   getCurrentUserId(): string | null {
     const token = localStorage.getItem('access-token');
     const payload = JSON.parse(atob(token.split('.')[1]));
     const userId = payload.sub || payload.userId || payload.commercialId || null;
     return userId;
   }
   ```

## 🔎 Logs de Depuración Agregados

Se agregaron logs para identificar el problema:

1. **Al inicializar el componente:**
   ```
   [ChatWidget] 🔑 User ID inicializado: {userId}
   ```

2. **Al cargar mensajes:**
   ```
   [ChatWidget] 🔑 Current User ID: {userId}
   [ChatWidget] 📊 Análisis de mensajes:
     [0] senderId: "{id}" | senderType: "{type}" | content: "..."
   ```

3. **Al recibir mensaje por WebSocket:**
   ```
   [ChatWidget] 🔍 Comparación - senderId: {id} vs currentUserId: {id}
   ```

## 🎯 Pasos para Depurar

1. **Abrir la aplicación en el navegador**
2. **Abrir DevTools (F12)**
3. **Ir a la consola**
4. **Abrir un chat y enviar un mensaje**
5. **Revisar los logs:**
   - ¿El `currentUserId` es `null`?
   - ¿Los `senderId` de los mensajes tienen un formato diferente?
   - ¿Hay diferencias de tipo (string vs number)?

## 🚨 Posibles Causas

### 1. User ID es null
Si el log muestra `currentUserId: null`, significa que:
- No hay token en localStorage
- El token no tiene los campos esperados (`sub`, `userId`, `commercialId`)

**Solución:**
```typescript
// Verificar que el token se guarda correctamente al hacer login
localStorage.setItem('access-token', token);
```

### 2. Formato de IDs no coincide
Si los IDs son diferentes en formato (ej: "123" vs 123, o "user-123" vs "123"):

**Solución:**
```typescript
// Normalizar ambos IDs antes de comparar
@let isOwn = String(message.senderId) === String(currentUserId());
```

### 3. User ID no se actualiza después del login
El signal se inicializa una vez pero no se actualiza si el usuario hace login después.

**Solución implementada:**
```typescript
ngOnInit(): void {
  // Inicializar currentUserId
  const userId = this.chatService.getCurrentUserId();
  console.log('[ChatWidget] 🔑 User ID inicializado:', userId);
  this.currentUserId.set(userId);
  // ...
}
```

### 4. El senderId viene del backend con un campo diferente
El backend puede estar retornando `commercialId` en lugar de `senderId`.

**Solución:**
Verificar en el servicio que el mapeo sea correcto:
```typescript
senderId: apiMessage.senderId || apiMessage.commercialId || apiMessage.userId
```

## 🔧 Solución Temporal Alternativa

Si el problema persiste, usar el método `isOwnMessage()` que ya existe en el componente:

**Template actual:**
```html
@let isOwn = message.senderId === currentUserId();
```

**Template alternativo (usando el método):**
```html
@let isOwn = isOwnMessage(message);
```

Y actualizar el método para ser más robusto:
```typescript
isOwnMessage(message: Message): boolean {
  const currentUserId = this.currentUserId() || this.chatService.getCurrentUserId();
  if (!currentUserId || !message.senderId) return false;
  
  // Normalizar para comparación
  return String(message.senderId) === String(currentUserId);
}
```

## 📝 Próximos Pasos

1. ✅ Ejecutar la aplicación con los logs agregados
2. ⏳ Identificar cuál de las causas es la raíz del problema
3. ⏳ Aplicar la solución correspondiente
4. ⏳ Probar enviando mensajes como comercial y visitante
5. ⏳ Verificar que los estilos se apliquen correctamente

## 📅 Fecha

9 de octubre de 2025
