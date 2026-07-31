# Troubleshooting: userId Vacío en Chat Widget

## 🐛 Problema

El debug muestra:
```
DEBUG: senderId="" | currentUserId="" | isOwn=false | senderType="COMMERCIAL"
```

Esto significa que tanto `senderId` como `currentUserId` están vacíos, por lo que los mensajes no se identifican correctamente como propios.

## 🔍 Diagnóstico

### Paso 1: Verificar Token en localStorage

Abre la consola del navegador y ejecuta:

```javascript
localStorage.getItem('access-token')
```

**Resultado esperado:** Un string con el JWT token
**Si es null:** El usuario no está autenticado correctamente

### Paso 2: Verificar Payload del Token

Si hay token, decodifícalo:

```javascript
const token = localStorage.getItem('access-token');
const payload = JSON.parse(atob(token.split('.')[1]));
console.log('Payload:', payload);
```

**Busca uno de estos campos:**
- `sub` (Subject - estándar JWT)
- `userId` 
- `commercialId`
- `id`

### Paso 3: Verificar Logs del Servicio

Busca en la consola:

```
[ChatService] 🔑 Token encontrado, decodificando...
[ChatService] 📦 Payload del token: { ... }
[ChatService] ✅ UserId extraído del token: <id>
```

O:

```
[ChatService] ⚠️ No hay token en localStorage
[ChatService] ⚠️ No se encontró userId en el token. Campos disponibles: [...]
```

## ✅ Soluciones

### Solución 1: Token No Existe

**Causa:** El usuario no se ha autenticado o el token expiró

**Pasos:**
1. Ir a la página de login
2. Iniciar sesión con credenciales válidas
3. Verificar que el login guarde el token:
   ```typescript
   localStorage.setItem('access-token', token);
   ```

### Solución 2: Campo del Token es Diferente

**Causa:** El backend usa un campo diferente para el userId

**Ejemplo de payload:**
```json
{
  "email": "comercial@example.com",
  "id": "12345",           // ← El campo se llama "id", no "userId"
  "role": "commercial",
  "iat": 1696867200,
  "exp": 1696953600
}
```

**Solución:** Actualizar el método `getCurrentUserId()`:

```typescript
getCurrentUserId(): string | null {
  // ...
  const payload = JSON.parse(atob(token.split('.')[1]));
  
  // Agregar el campo que usa tu backend
  const userId = payload.sub 
    || payload.userId 
    || payload.commercialId 
    || payload.id              // ← Agregar esta línea
    || null;
  
  return userId;
}
```

### Solución 3: Guardar userId Explícitamente

**Opción más robusta:** Guardar el userId en localStorage durante el login

**En el componente de login:**
```typescript
login(credentials) {
  this.authService.login(credentials).subscribe(response => {
    // Guardar token
    localStorage.setItem('access-token', response.token);
    
    // Guardar userId explícitamente
    const payload = JSON.parse(atob(response.token.split('.')[1]));
    const userId = payload.sub || payload.userId || payload.id;
    
    if (userId) {
      localStorage.setItem('user-id', userId);
      console.log('UserId guardado:', userId);
    }
    
    // Navegar
    this.router.navigate(['/dashboard']);
  });
}
```

**Actualizar el servicio:**
```typescript
getCurrentUserId(): string | null {
  // Priorizar el userId guardado explícitamente
  const savedUserId = localStorage.getItem('user-id');
  if (savedUserId) {
    this.currentUserId = savedUserId;
    return savedUserId;
  }
  
  // Fallback: extraer del token
  // ... código existente ...
}
```

## 🧪 Verificación

Después de aplicar la solución:

1. **Recargar la página** (F5)
2. **Abrir el chat widget**
3. **Enviar un mensaje**
4. **Verificar en consola:**
   ```
   [ChatService] ✅ UserId extraído del token: abc123
   [ChatWidget] 🔑 UserId al crear mensaje optimista: abc123
   [ChatWidget] 📤 Mensaje optimista creado: { senderId: "abc123", ... }
   ```
5. **Verificar en el debug visual:**
   ```
   DEBUG: senderId="abc123" | currentUserId="abc123" | isOwn=true | senderType="COMMERCIAL"
   ```

## 📋 Checklist de Debug

- [ ] ¿Hay token en localStorage?
- [ ] ¿El token se puede decodificar?
- [ ] ¿Qué campos tiene el payload?
- [ ] ¿Alguno de los campos esperados existe? (`sub`, `userId`, `commercialId`, `id`)
- [ ] ¿El login guarda el token correctamente?
- [ ] ¿Los logs muestran el userId extraído?

## 🔗 Archivos Relacionados

- `libs/chat/data-access/visitors-data-service/src/lib/chat.service.ts` - Método `getCurrentUserId()`
- `libs/chat/ui/chat-widget/src/lib/chat-widget/chat-widget.ts` - Uso del userId
- `libs/auth/features/login/` - Componente de login (si existe)

## 📅 Fecha

9 de octubre de 2025
