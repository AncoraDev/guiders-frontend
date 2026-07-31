# Quick Start - Sistema de Visitantes con Infinite Scroll

## Ubicaciones Clave de Archivos

```
libs/chat/data-access/visitors-data-service/src/lib/
└── visitors-data-service.ts ...................... Servicio HTTP

libs/chat/features/visitors/src/lib/
├── visitors/
│   ├── visitors.ts .............................. Componente contenedor (2077 líneas)
│   ├── visitors.html ........................... Template (201 líneas)
│   └── visitors.scss ........................... Estilos (769 líneas)

libs/chat/ui/visitors-list/src/lib/visitors-list/
├── visitors-list.ts ............................ Componente tabla (788 líneas)
├── visitors-list.html .......................... Template tabla (442 líneas)
└── visitors-list.scss .......................... Estilos tabla (858 líneas)
```

---

## Cómo Funciona en 30 Segundos

### 1. Usuario Llega a la Página
```
VisitorsComponent.ngOnInit()
  → loadVisitors() con page: 1, limit: 25
    → VisitorsDataService.searchVisitors()
      → Mostrar 25 visitantes
        → IntersectionObserver observa el sentinel
```

### 2. Usuario Scrollea Hacia Abajo
```
Sentinel se vuelve visible (200px antes del final)
  → IntersectionObserver callback
    → VisitorsListComponent.loadMore.emit()
      → VisitorsComponent.onLoadMore()
        → searchVisitors() con page: 2, limit: 25
          → Mostrar 3 skeleton rows mientras carga
            → Response llega con 25 nuevos visitantes
              → state.visitors = [...50 anteriores, ...25 nuevos] (APPEND!)
                → Remover skeletons, animar nuevas filas
```

### 3. Usuario Aplica Filtro
```
VisitorsComponent.searchVisitorsWithFilters()
  → _cancelLoadMore$.next() (cancela cargas en vuelo)
    → isResetting = true (bloquea procesamiento de cargas viejas)
      → infiniteOffset = 0, hasMore = true, visitors = []
        → searchVisitors() con nuevos filtros, page: 1
          → Response llega
            → isResetting = false (puede procesar)
              → state.visitors = [25 nuevos resultados]
                → Tabla resetea
```

---

## Componentes Clave

### VisitorsComponent (Contenedor)
- **Señales**:
  - `state`: Estado global (visitors array, filters, pagination)
  - `isLoadingMore`: ¿Cargando el siguiente lote?
  - `hasMore`: ¿Hay más datos disponibles?
  - `lastBatchStartIndex`: Índice del último lote (para animar)

- **Métodos**:
  - `loadVisitors()`: Cargar primera página
  - `onLoadMore()`: Cargar siguiente página (infinite scroll)
  - `searchVisitorsWithFilters()`: Resetear y buscar con filtros

### VisitorsListComponent (Tabla)
- **Inputs**:
  - `visitors`: Array de visitantes
  - `isLoadingMore`: ¿Cargando?
  - `hasMore`: ¿Hay más?
  - `lastBatchStartIndex`: Para animar

- **Outputs**:
  - `loadMore`: Emitido cuando sentinel es visible

- **IntersectionObserver**:
  - Observa el sentinel element
  - Emite `loadMore` cuando es visible
  - rootMargin: `'0px 0px 200px 0px'` (cargar 200px antes del final)

---

## El Sentinel Element (Crucial)

```html
<!-- En visitors-list.html, DESPUÉS de todas las filas reales -->
<div #scrollSentinel class="visitors-list__sentinel" aria-hidden="true"></div>
```

```scss
// En visitors-list.scss
.visitors-list__sentinel {
  height: 1px;
  visibility: hidden;  // Invisible pero ocupa espacio
}
```

**Cómo funciona**:
1. IntersectionObserver observa este elemento
2. Cuando se vuelve visible (200px antes del final), dispara `loadMore`
3. Se cargan más visitantes
4. El sentinel baja a la nueva posición (al final de la tabla expandida)

---

## Guarda de Seguridad en onLoadMore()

```typescript
onLoadMore(): void {
  if (this.isResetting)       // ❌ No cargar si hay reset
    return;
  if (this.isLoadingMore())   // ❌ No cargar dos veces
    return;
  if (!this.hasMore())        // ❌ No cargar si no hay más
    return;
  if (this.state().loading)   // ❌ No cargar si carga inicial
    return;

  // ... proceder a cargar
}
```

---

## Cálculo de Página

```typescript
const infiniteOffset = 25;  // Primera carga de 25
const batchSize = 25;

const page = Math.floor(infiniteOffset / batchSize) + 1;
// page = Math.floor(25/25) + 1 = 2
```

**Secuencia**:
- Página 1: offset 0, items 0-24
- Página 2: offset 25, items 25-49
- Página 3: offset 50, items 50-74
- Página 4: offset 75, items 75-99

---

## APPEND vs REPLACE (Crítico)

### ✅ CORRECTO (APPEND)
```typescript
const merged = [...currentVisitors, ...newVisitors];
this.updateState({ visitors: merged });
// Estado: [25 anteriores + 25 nuevos] = 50 total
```

### ❌ INCORRECTO (REPLACE)
```typescript
this.updateState({ visitors: newVisitors });
// Estado: solo los 25 nuevos (¡perdimos los anteriores!)
```

---

## Animaciones Staggered

### TypeScript
```typescript
isNewBatchRow(index: number): boolean {
  const batchStart = this.lastBatchStartIndex();
  return batchStart > 0 && index >= batchStart && index < batchStart + 3;
}

getRowAnimationDelay(index: number): number {
  const batchStart = this.lastBatchStartIndex();
  return (index - batchStart) * 30;  // 0ms, 30ms, 60ms
}
```

### HTML
```html
<tr
  [class.visitors-table__row--new-batch]="isNewBatchRow(i)"
  [style.animation-delay]="getRowAnimationDelay(i) + 'ms'"
>
```

### CSS
```scss
.visitors-table__row--new-batch {
  animation: vl-row-enter 180ms ease both;
}

@keyframes vl-row-enter {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
```

---

## Estructura Flexbox (Crítica)

### Contenedor Padre (visitors.html)
```scss
.visitors-panel__list-container {
  flex: 1;           // Ocupar espacio disponible
  overflow: hidden;  // NO crear scroll aquí
  min-height: 0;     // CRÍTICO: permitir contracción en flexbox
}
```

### Contenedor Hijo (visitors-list.ts)
```scss
.visitors-list__table-container {
  overflow: auto;    // AQUÍ ESTÁ EL SCROLL
  flex: 1;
  min-height: 0;     // CRÍTICO
}
```

**Por qué**:
- `flex: 1` + `min-height: 0` permite que flexbox calcule altura correcta
- Sin `min-height: 0`, flexbox no contraerá el container
- El scroll debe estar **una sola vez** en la jerarquía

---

## Headers Sticky

```scss
.visitors-table__header {
  position: sticky;
  top: 0;           // Se queda arriba al scrollear
  z-index: 10;      // Encima del contenido
  background: var(--color-bg-primary);
}
```

**Funciona porque**:
- `.visitors-list__table-container` tiene `overflow: auto`
- Headers usan `position: sticky; top: 0;`
- z-index mantiene headers encima

---

## Skeleton Rows (Loading State)

### HTML
```html
@if (isLoadingMore()) {
  @for (skeleton of [1, 2, 3]; track skeleton) {
    <tr class="visitors-table__row--skeleton">
      <td><div class="skeleton skeleton--name"></div></td>
      <!-- más celdas skeleton -->
    </tr>
  }
}
```

### CSS
```scss
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-surface-secondary) 25%,
    var(--color-surface-hover) 50%,
    var(--color-surface-secondary) 75%
  );
  background-size: 200% 100%;
  animation: vl-shimmer 1.4s infinite linear;
}

@keyframes vl-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

---

## Fin de Lista

```html
@if (!hasMore() && filteredVisitors().length > 0 && !isLoadingMore()) {
  <div class="visitors-list__end-message">
    Mostrando {{ filteredVisitors().length }} visitantes
  </div>
}
```

Solo se muestra cuando:
- `!hasMore()`: No hay más datos
- `filteredVisitors().length > 0`: Hay al menos un visitante
- `!isLoadingMore()`: No está cargando

---

## Reseteo de Filtros

```typescript
private searchVisitorsWithFilters(): void {
  this._cancelLoadMore$.next();  // Cancela cualquier carga en vuelo
  this.isResetting = true;       // Prevenir que cargas viejas se apliquen
  
  // Resetear estado
  this.infiniteOffset = 0;
  this.hasMore.set(true);
  this.lastBatchStartIndex.set(0);
  this.updateState({ visitors: [] });

  // Hacer nueva búsqueda
  this.visitorsService.searchVisitors(companyId, request)
    .pipe(finalize(() => { this.isResetting = false; }))
    .subscribe((response) => {
      // Procesar respuesta
    });
}
```

**Por qué es importante**:
1. `_cancelLoadMore$.next()` cancela Observable pendientes
2. `isResetting = true` previene que se procesen resultados viejos
3. `finalize(() => { this.isResetting = false; })` limpia el flag

---

## Debugging

### ¿No carga más visitantes?
1. Verificar que sentinel element está en HTML
2. Verificar que `.visitors-list__table-container` tiene `overflow: auto`
3. Verificar que `loadMore.emit()` se dispara en IntersectionObserver
4. Verificar que `onLoadMore()` se llama en el contenedor

### ¿Headers se esconden al scrollear?
1. Verificar que `.visitors-table__header` tiene `position: sticky; top: 0;`
2. Verificar que `.visitors-list__table-container` tiene `overflow: auto`

### ¿Skeleton rows no aparecen?
1. Verificar que `isLoadingMore()` se pasa correctamente
2. Verificar que Skeleton rows están en HTML dentro de tabla

### ¿Filas nuevas no se animan?
1. Verificar que `isNewBatchRow()` retorna true para índices correctos
2. Verificar que `getRowAnimationDelay()` retorna valores correctos
3. Verificar que animation CSS está definida

---

## Resumen Técnico

| Aspecto | Implementación |
|---------|----------------|
| **Lazy Loading** | IntersectionObserver en sentinel element |
| **Trigger** | Cuando sentinel está visible + rootMargin 200px |
| **Método HTTP** | POST `/tenant-visitors/{tenantId}/visitors/search` |
| **Paginación** | Basada en página (page 1, 2, 3, etc.) |
| **Tamaño de Lote** | 25 visitantes por carga |
| **APPEND** | Sí, fusionar con visitantes anteriores |
| **Guardias** | isResetting, isLoadingMore, hasMore, loading |
| **Cancelación** | Via _cancelLoadMore$ Subject |
| **Skeleton Rows** | 3 filas mientras carga |
| **Animaciones** | Staggered 30ms por fila (primeras 3) |
| **Headers** | Sticky con position: sticky; top: 0; |
| **Reset Filtros** | Cancela cargas, marca isResetting, reajusta offset |

