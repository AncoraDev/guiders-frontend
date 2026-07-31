# Animación de Loading - Tabla de Visitantes

## 📋 Resumen Ejecutivo

La animación de loading de la tabla de visitantes aparece cuando el estado `loading` del componente `VisitorsComponent` se activa (`loading: true`). Este estado controla una pantalla de carga con spinner que reemplaza temporalmente la tabla.

## 🎨 Cómo se Ve

**Ubicación:** `libs/chat/ui/visitors-list/src/lib/visitors-list/visitors-list.html`

```html
@if (loading()) {
  <div class="visitors-list__loading">
    <div class="loading-spinner"></div>
    <p>Cargando visitantes...</p>
  </div>
}
```

**Apariencia:**
- ✅ Spinner circular animado
- ✅ Texto "Cargando visitantes..."
- ✅ Reemplaza completamente la tabla mientras está activo
- ✅ Centrado vertical y horizontalmente

## 🔄 Momentos en que Aparece el Loading

### 1. **Carga Inicial de Visitantes** 🚀
**Método:** `loadVisitors()` (línea 352)  
**Cuándo:** Al inicializar el componente o al cambiar de filtros/página

```typescript
loadVisitors(): void {
  this.updateState({ loading: true, error: null }); // ⏳ Activa loading
  
  // Mock data (simulación con setTimeout)
  if (this.useMockData) {
    setTimeout(() => {
      this.updateState({ 
        visitors: mockResponse.visitors,
        loading: false // ✅ Desactiva loading después de 500ms
      });
    }, 500);
  }
  
  // Datos reales (llamada HTTP)
  else {
    this.visitorsService.getVisitors(tenantId, queryParams)
      .subscribe((response) => {
        this.updateState({ 
          visitors: response.visitors,
          loading: false // ✅ Desactiva cuando llega la respuesta
        });
      });
  }
}
```

**Disparadores:**
- ✅ Primera carga del componente (`ngOnInit`)
- ✅ Cambio de filtro preset (`onFilterPresetChange`)
- ✅ Cambio de filtros personalizados (`onFilterChange`)
- ✅ Cambio de ordenamiento (`onSortChange`)
- ✅ Cambio de página (`onPageChange`)
- ✅ Cambio de tamaño de página (`onPageSizeChange`)

**Duración:**
- **Mock data:** ~500ms (simulación)
- **Datos reales:** Depende del tiempo de respuesta del servidor (típicamente 200-1000ms)

---

### 2. **Crear Chat con Visitante** 💬
**Método:** `onModalCreateChat()` (línea 554)  
**Cuándo:** Al crear un nuevo chat desde el modal

```typescript
onModalCreateChat(request: CreateChatWithVisitorRequest): void {
  this.updateState({ loading: true }); // ⏳ Activa loading
  
  this.visitorsService.createChatWithVisitor(request)
    .pipe(
      finalize(() => this.updateState({ loading: false })) // ✅ Siempre desactiva
    )
    .subscribe((response) => {
      if (response) {
        this.closeCreateChatModal();
        this.refreshVisitors(); // Recarga la tabla
      }
    });
}
```

**Disparadores:**
- ✅ Usuario hace clic en "Chat" → abre modal → completa formulario → envía

**Duración:** Tiempo de respuesta del endpoint `/api/chats/create` (típicamente 300-800ms)

---

### 3. **Tomar Chat Pendiente Automáticamente** ⚡
**Método:** `onTakePendingChatAutomatically()` (línea 681)  
**Cuándo:** Al hacer clic en el botón de chats pendientes (auto-asignación)

```typescript
onTakePendingChatAutomatically(data: {visitor: Visitor, chatId: string}): void {
  this.updateState({ loading: true, error: null }); // ⏳ Activa loading
  
  this.sessionService.ensureSession$().pipe(
    switchMap(user => 
      this.visitorsService.assignChatToCommercial(data.chatId, user.sub)
    )
  ).subscribe((response) => {
    if (response?.success) {
      // Actualización optimista - NO recarga desde servidor
      this.updateState({ 
        visitors: updatedVisitors,
        loading: false // ✅ Desactiva después de actualizar localmente
      });
    }
  });
}
```

**Disparadores:**
- ✅ Usuario hace clic en botón naranja con número de chats pendientes

**Duración:** 
- Tiempo de respuesta del endpoint `/api/chats/{chatId}/assign` (típicamente 200-500ms)
- **NO recarga** la tabla completa → Actualización optimista más rápida

---

### 4. **Tomar Chat Pendiente desde Modal** 📋
**Método:** `onTakePendingChat()` (línea 767)  
**Cuándo:** Al tomar un chat desde el modal de chats pendientes (flujo antiguo)

```typescript
onTakePendingChat(chatId: string): void {
  this.updateState({ loading: true }); // ⏳ Activa loading
  
  this.sessionService.ensureSession$().pipe(
    switchMap(user => 
      this.visitorsService.assignChatToCommercial(chatId, user.sub)
    ),
    finalize(() => this.updateState({ loading: false })) // ✅ Siempre desactiva
  ).subscribe((response) => {
    if (response?.success) {
      this.closePendingChatsModal();
      this.refreshVisitors(); // Recarga la tabla desde el servidor
    }
  });
}
```

**Disparadores:**
- ✅ Usuario abre modal de chats pendientes → selecciona uno → hace clic en "Tomar"

**Duración:** Tiempo de asignación + tiempo de recarga completa de visitantes (típicamente 500-1200ms)

---

### 5. **Transferir Chat Pendiente** 🔄
**Método:** `onTransferPendingChat()` (línea 812)  
**Cuándo:** Al transferir un chat pendiente a otro comercial

```typescript
onTransferPendingChat(data: {chatId: string, targetUserId: string}): void {
  this.updateState({ loading: true }); // ⏳ Activa loading
  
  this.visitorsService.assignChatToCommercial(data.chatId, data.targetUserId)
    .pipe(
      finalize(() => this.updateState({ loading: false })) // ✅ Siempre desactiva
    )
    .subscribe((response) => {
      if (response?.success) {
        this.closePendingChatsModal();
        this.refreshVisitors(); // Recarga la tabla desde el servidor
      }
    });
}
```

**Disparadores:**
- ✅ Usuario abre modal de chats pendientes → selecciona chat → elige comercial destino → transfiere

**Duración:** Tiempo de transferencia + tiempo de recarga completa de visitantes (típicamente 500-1200ms)

---

## 🎯 Estados de la Tabla

La tabla puede estar en **4 estados diferentes**:

### 1. ⏳ **Loading** (Cargando)
```typescript
loading: true
```
- Muestra spinner + "Cargando visitantes..."
- Oculta la tabla, errores y estado vacío
- Duración: 200-1200ms según la operación

### 2. ❌ **Error** (Error)
```typescript
loading: false
error: 'Mensaje de error'
```
- Muestra icono de advertencia + mensaje de error
- Oculta la tabla, loading y estado vacío
- Ejemplo: "No se pudieron obtener los sitios de la empresa."

### 3. ✅ **Tabla con Datos** (Éxito)
```typescript
loading: false
error: null
filteredVisitors().length > 0
```
- Muestra la tabla completa con visitantes
- Estado normal de operación

### 4. 📭 **Estado Vacío** (Sin resultados)
```typescript
loading: false
error: null
filteredVisitors().length === 0
```
- Muestra ilustración + "No hay visitantes"
- Aparece cuando no hay datos o los filtros no coinciden

## 🔍 Lógica de Renderizado Condicional

**Template:** `visitors-list.html`

```html
<!-- Prioridad 1: Loading -->
@if (loading()) {
  <div class="visitors-list__loading">...</div>
}

<!-- Prioridad 2: Error -->
@if (error(); as errorMessage) {
  <div class="visitors-list__error">...</div>
}

<!-- Prioridad 3: Tabla con datos -->
@if (!loading() && !error() && filteredVisitors().length > 0) {
  <div class="visitors-list__table-container">
    <table class="visitors-table">...</table>
  </div>
}

<!-- Prioridad 4: Estado vacío -->
@if (!loading() && !error() && filteredVisitors().length === 0) {
  <div class="visitors-list__empty">...</div>
}
```

**Orden de evaluación:**
1. Si `loading` → Muestra spinner (detiene evaluación)
2. Si no loading pero hay `error` → Muestra error (detiene evaluación)
3. Si no loading ni error pero hay visitantes → Muestra tabla
4. Si no loading ni error y NO hay visitantes → Muestra estado vacío

## ⚡ Optimización: Actualización Optimista

En el método `onTakePendingChatAutomatically()` se implementó **actualización optimista**:

**Beneficios:**
- ✅ Loading dura solo 200-500ms (solo la asignación del chat)
- ✅ NO recarga toda la tabla desde el servidor
- ✅ Actualiza solo el visitante afectado en el estado local
- ✅ UX más rápida y fluida

**Otros métodos antiguos:**
- ❌ Loading dura 500-1200ms (asignación + recarga completa)
- ❌ Llaman a `refreshVisitors()` que hace una nueva petición HTTP
- ❌ UX más lenta

**Recomendación:** Migrar los otros métodos (`onTakePendingChat`, `onTransferPendingChat`) al patrón optimista.

## 🐛 Debugging del Loading

Para verificar cuándo y por qué aparece el loading:

```typescript
// Agregar en updateState()
private updateState(updates: Partial<VisitorState>): void {
  if (updates.loading !== undefined) {
    console.log('🔄 Loading state changed:', updates.loading);
    console.trace('Called from:'); // Ver stack trace
  }
  this.state.update(current => ({ ...current, ...updates }));
  this.cdr.markForCheck();
}
```

## 📊 Resumen de Duraciones

| Operación | Duración Típica | Tipo de Actualización |
|-----------|----------------|----------------------|
| Carga inicial (mock) | ~500ms | Reload completo |
| Carga inicial (real) | 200-1000ms | Reload completo |
| Cambio de filtro/página | 200-1000ms | Reload completo |
| Crear chat | 300-800ms | Reload completo |
| Tomar chat (automático) | 200-500ms | **Optimista** ✅ |
| Tomar chat (modal) | 500-1200ms | Reload completo |
| Transferir chat | 500-1200ms | Reload completo |

## ✅ Checklist de Estados

- [x] Loading se activa antes de operaciones asíncronas
- [x] Loading se desactiva en `.subscribe()` success
- [x] Loading se desactiva en `.pipe(finalize())` para garantizar limpieza
- [x] Loading se desactiva en `.catchError()` para casos de error
- [x] ChangeDetectorRef.markForCheck() se llama en updateState() para actualizar la UI

---

**Última actualización:** 8 de octubre de 2025  
**Componente UI:** `libs/chat/ui/visitors-list`  
**Componente Lógica:** `libs/chat/features/visitors`  
**Estado:** `VisitorState.loading: boolean`
